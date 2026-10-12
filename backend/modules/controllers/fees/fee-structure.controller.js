'use strict';
const FeeStructureModel = require('../../models/fees/fee-structure');
const StudentFeeRecordModel = require('../../models/fees/student-fee-record');
const FeePaymentModel = require('../../models/fees/fee-payment');
const { NotFoundError, ConflictError, ValidationError } = require('../../errors');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/fees.messages');
const { ensureSessionId } = require('../../helpers/academic-session/session-resolver');
const { loadSubjectGroups } = require('../../helpers/student/student.utils');
const { withTransaction } = require('../../helpers/with-transaction');
const {
    MODULE, PERMISSIONS, actorOf, canEditOf, isObjectId, toObjectId, requireSessionId, shortSession, loadSessionLabels,
    loadClassIndex, titleCase, offsetPage,
} = require('../../helpers/fees/fee-context');
const { syncRecordsForStructure } = require('../../helpers/fees/fee-record-sync');
const { logActivity } = require('../../services/activity-log.service');
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');

// Fee Structure (fees/fee-structure.md) — a Class(+Stream+Group)'s annual fee for one
// session: admission fee + named particulars. The list and the Breakdown read are the
// module's one near-static cache (fees/optimization.md); every write invalidates it and
// re-prices the student fee records the structure applies to, in the same transaction.
// Writes need the explicit 'fees-structure' grant (routes).
const ENTITY = 'Fee structure';

const notFound = (id) => new NotFoundError(messages.structureNotFound(), { module: MODULE, code: 'FEE_STRUCTURE_NOT_FOUND', context: { id } });
const duplicate = () => new ConflictError(messages.structureDuplicate(), {
    module: MODULE,
    code: 'FEE_STRUCTURE_DUPLICATE',
    fields: [{ field: 'classId', message: messages.structureDuplicate(), code: 'FEE_STRUCTURE_DUPLICATE' }],
});
const rethrowDuplicate = (error) => {
    if (error && (error.code === 11000 || /E11000/.test(String(error.message || '')))) throw duplicate();
    throw error;
};
const placementError = (field, message, code = 'VALIDATION_FAILED') => new ValidationError(message, {
    module: MODULE, code, fields: [{ field, message, code }],
});

const invalidate = (adminId) => cacheService.delPattern(cacheKeys.fees.structurePattern(adminId));

const particularTotal = (structure) => FeeStructureModel.totalOf(structure);

/** One table row, labels resolved against Academic Setup. */
const toRow = (structure, classIndex, groupNames, sessionLabel) => {
    const entry = classIndex.get(String(structure.classId));
    const stream = entry && structure.streamId ? entry.streams.get(String(structure.streamId)) : null;
    return {
        _id: String(structure._id),
        session: sessionLabel,
        sessionShort: shortSession(sessionLabel),
        classId: String(structure.classId),
        streamId: structure.streamId ? String(structure.streamId) : '',
        groupId: structure.groupId ? String(structure.groupId) : '',
        className: entry ? entry.label : '—',
        classOrder: entry ? entry.doc.order : 999,
        streamName: stream ? titleCase(stream.name) : null,
        groupName: structure.groupId ? groupNames.get(String(structure.groupId)) || null : null,
        admissionFee: structure.admissionFee || 0,
        particulars: (structure.particulars || []).map((item) => ({ name: item.name, amount: item.amount })),
        particularTotal: particularTotal(structure),
    };
};

const loadLabels = async (adminId) => {
    const [classIndex, groups] = await Promise.all([loadClassIndex(adminId), loadSubjectGroups(adminId)]);
    return { classIndex, groupNames: new Map(groups.map((group) => [String(group._id), group.name])) };
};

/** The session's structures as table rows — `{adminId}:fees:structure:list:{sessionId}`. */
const loadStructureRows = (adminId, sessionId, sessionLabel) => cacheService.wrap(
    cacheKeys.fees.structures(adminId, String(sessionId)),
    cacheService.TTL.NEAR_STATIC_45,
    async () => {
        const [structures, labels] = await Promise.all([
            FeeStructureModel.find({ adminId, sessionId, deletedAt: null }).lean(),
            loadLabels(adminId),
        ]);
        return structures
            .map((structure) => toRow(structure, labels.classIndex, labels.groupNames, sessionLabel))
            .sort((a, b) => a.classOrder - b.classOrder
                || String(a.streamName || '').localeCompare(String(b.streamName || ''))
                || String(a.groupName || '').localeCompare(String(b.groupName || '')));
    }
);

let GetFeeStructures = async (req, res) => {
    const { adminId, session, classId, streamId, groupId, search, page, limit } = req.query;
    const sessionId = await requireSessionId(adminId, session);
    const all = await loadStructureRows(adminId, sessionId, session);
    const term = String(search || '').trim().toLowerCase();
    const rows = all.filter((row) => (!classId || row.classId === classId)
        && (!streamId || row.streamId === streamId)
        && (!groupId || row.groupId === groupId)
        && (!term || [row.className, row.streamName, row.groupName].filter(Boolean).some((text) => text.toLowerCase().includes(term))));
    const result = offsetPage(rows, page, limit);
    result.summary = { structures: all.length, classesCovered: new Set(all.map((row) => row.classId)).size };
    result.canEdit = canEditOf(req, PERMISSIONS.STRUCTURE);
    return res.status(200).json(result);
};

/** The Breakdown modal — `{adminId}:fees:structure:{id}`. */
let GetFeeStructure = async (req, res) => {
    const { adminId } = req.query;
    if (!isObjectId(req.params.id)) throw notFound(req.params.id);
    const row = await cacheService.wrap(cacheKeys.fees.structure(adminId, req.params.id), cacheService.TTL.NEAR_STATIC_45, async () => {
        const structure = await FeeStructureModel.findOne({ _id: req.params.id, adminId, deletedAt: null }).lean();
        if (!structure) return null;
        const [labels, sessionLabels] = await Promise.all([loadLabels(adminId), loadSessionLabels(adminId)]);
        return toRow(structure, labels.classIndex, labels.groupNames, sessionLabels.get(String(structure.sessionId)) || null);
    });
    if (!row) throw notFound(req.params.id);
    return res.status(200).json({ structure: row });
};

/** The class/stream/group must exist in Academic Setup; a streamed class needs its stream. */
const resolveStructurePlacement = async (adminId, { classId, streamId, groupId }) => {
    const [classIndex, groups] = await Promise.all([loadClassIndex(adminId), loadSubjectGroups(adminId)]);
    const entry = classIndex.get(String(classId));
    if (!entry) throw placementError('classId', messages.placementInvalid());
    if (entry.doc.hasStreams) {
        if (!streamId) throw placementError('streamId', messages.streamRequired(), 'STREAM_REQUIRED');
        if (!entry.streams.has(String(streamId))) throw placementError('streamId', messages.placementInvalid());
    } else if (streamId) {
        throw placementError('streamId', messages.placementInvalid());
    }
    if (groupId) {
        const group = groups.find((item) => String(item._id) === String(groupId));
        if (!group || String(group.classId) !== String(classId) || String(group.streamId || '') !== String(streamId || '')) {
            throw placementError('groupId', messages.placementInvalid());
        }
    }
    return { classId: toObjectId(classId), streamId: toObjectId(streamId), groupId: toObjectId(groupId) };
};

const feeFields = (body) => ({
    admissionFee: Number(body.admissionFee) || 0,
    particulars: (body.particulars || []).map((item) => ({ name: String(item.name).trim(), amount: Number(item.amount) })),
});

const respond = async (adminId, structure, sessionLabel) => {
    const labels = await loadLabels(adminId);
    return toRow(structure, labels.classIndex, labels.groupNames, sessionLabel);
};

let CreateFeeStructure = async (req, res) => {
    const { adminId, session } = req.body;
    const sessionId = await ensureSessionId(adminId, session);
    const placement = await resolveStructurePlacement(adminId, req.body);
    const actor = actorOf(req);
    const key = { adminId, sessionId, ...placement };

    const { structure, sync } = await withTransaction(async (dbSession) => {
        // A soft-deleted structure on the same key is revived, never duplicated.
        const deleted = await FeeStructureModel.findOne({ ...key, deletedAt: { $ne: null } }).session(dbSession);
        let doc;
        if (deleted) {
            Object.assign(deleted, feeFields(req.body), { deletedAt: null, updatedBy: actor, updatedAt: new Date() });
            doc = await deleted.save({ session: dbSession });
        } else {
            [doc] = await FeeStructureModel.create([{ ...key, ...feeFields(req.body), createdBy: actor, updatedBy: actor }], { session: dbSession });
        }
        const counts = await syncRecordsForStructure(adminId, doc.toObject(), { actor, dbSession });
        return { structure: doc.toObject(), sync: counts };
    }).catch(rethrowDuplicate);

    await invalidate(adminId);
    await logActivity(req, {
        module: MODULE, action: 'fees.structure.create', targetId: String(structure._id),
        meta: { session, ...feeFields(structure), recordsCreated: sync.created, recordsUpdated: sync.updated },
    });
    return res.status(200).json({ message: success.created(ENTITY), structure: await respond(adminId, structure, session), sync });
};

/**
 * Only the money changes on edit — Session / Class / Stream / Group are the structure's
 * identity (the modal shows them locked). Re-prices every student record it applies to;
 * refused, with a count, if that would bill anyone less than they have already paid.
 */
let UpdateFeeStructure = async (req, res) => {
    const { adminId } = req.body;
    if (!isObjectId(req.params.id)) throw notFound(req.params.id);
    const actor = actorOf(req);

    const { before, structure, sync } = await withTransaction(async (dbSession) => {
        const doc = await FeeStructureModel.findOne({ _id: req.params.id, adminId, deletedAt: null }).session(dbSession);
        if (!doc) throw notFound(req.params.id);
        const prior = feeFields(doc);
        Object.assign(doc, feeFields(req.body), { updatedBy: actor, updatedAt: new Date() });
        await doc.save({ session: dbSession });
        const counts = await syncRecordsForStructure(adminId, doc.toObject(), { actor, dbSession });
        return { before: prior, structure: doc.toObject(), sync: counts };
    });

    await invalidate(adminId);
    await logActivity(req, {
        module: MODULE, action: 'fees.structure.update', targetId: String(structure._id),
        changes: { before, after: feeFields(structure) }, meta: { recordsCreated: sync.created, recordsUpdated: sync.updated },
    });
    const sessionLabels = await loadSessionLabels(adminId);
    return res.status(200).json({
        message: success.updated(ENTITY),
        structure: await respond(adminId, structure, sessionLabels.get(String(structure.sessionId)) || null),
        sync,
    });
};

/** Linked records that money has touched — payments recorded or dues carried. */
const recordsInUse = async (adminId, structureId, dbSession = null) => {
    const records = await StudentFeeRecordModel.find({ adminId, feeStructureId: structureId, deletedAt: null }, '_id arrears')
        .session(dbSession).lean();
    if (!records.length) return { records, inUse: 0 };
    const paidIds = await FeePaymentModel.distinct('studentFeeRecordId',
        { adminId, studentFeeRecordId: { $in: records.map((record) => record._id) }, deletedAt: null }).session(dbSession);
    const paid = new Set(paidIds.map(String));
    const inUse = records.filter((record) => paid.has(String(record._id)) || (record.arrears || []).length).length;
    return { records, inUse };
};

/**
 * Blocked, with the count, once any student record built from it has a payment or carried
 * dues (fees/errors.md FEE_STRUCTURE_IN_USE). Otherwise — typed DELETE — the structure and
 * its untouched generated records are soft-deleted together; anyone a class-wide structure
 * still covers is re-billed under it.
 */
let DeleteFeeStructure = async (req, res) => {
    const { adminId, confirm } = req.query;
    if (!isObjectId(req.params.id)) throw notFound(req.params.id);
    const actor = actorOf(req);

    const structure = await withTransaction(async (dbSession) => {
        const doc = await FeeStructureModel.findOne({ _id: req.params.id, adminId, deletedAt: null }).session(dbSession).lean();
        if (!doc) throw notFound(req.params.id);
        const { records, inUse } = await recordsInUse(adminId, doc._id, dbSession);
        if (inUse) {
            throw new ConflictError(messages.structureInUse(inUse), {
                module: MODULE, code: 'FEE_STRUCTURE_IN_USE', context: { count: inUse },
                rows: [{ row: 0, code: 'FEE_STRUCTURE_IN_USE', count: inUse }],
            });
        }
        if (confirm !== 'DELETE') {
            throw new ValidationError(messages.deleteRequiresConfirm(), {
                module: MODULE, code: 'VALIDATION_FAILED', fields: [{ field: 'confirm', message: messages.deleteRequiresConfirm() }],
            });
        }
        const now = new Date();
        await FeeStructureModel.updateOne({ _id: doc._id, adminId }, { $set: { deletedAt: now, updatedBy: actor, updatedAt: now } }, { session: dbSession });
        if (records.length) {
            await StudentFeeRecordModel.updateMany({ _id: { $in: records.map((record) => record._id) }, adminId },
                { $set: { deletedAt: now, updatedAt: now } }, { session: dbSession });
        }
        // A group-specific structure's students fall back to the class(+stream)-wide one.
        if (doc.groupId) {
            const fallback = await FeeStructureModel.findOne({
                adminId, sessionId: doc.sessionId, classId: doc.classId, streamId: doc.streamId || null, groupId: null, deletedAt: null,
            }).session(dbSession).lean();
            if (fallback) await syncRecordsForStructure(adminId, fallback, { actor, dbSession });
        }
        return { ...doc, removedRecords: records.length };
    });

    await invalidate(adminId);
    await logActivity(req, {
        module: MODULE, action: 'fees.structure.delete', targetId: String(structure._id),
        meta: { ...feeFields(structure), removedRecords: structure.removedRecords },
    });
    return res.status(200).json({ message: success.deleted(ENTITY) });
};

module.exports = {
    GetFeeStructures,
    GetFeeStructure,
    CreateFeeStructure,
    UpdateFeeStructure,
    DeleteFeeStructure,
};
