'use strict';
const FeeStructureModel = require('../../models/fees/fee-structure');
const { toObjectId } = require('../student/student.utils');

/**
 * The FeeStructure for a placement: the exact (class, stream, group) one if the school has
 * set one up per Subject Group, else the class(+stream)-wide one (groupId null).
 *
 * @returns {Promise<{ structure: Object, totalFee: Number, admissionFee: Number }|null>}
 *          null = no fee structure for this class/session yet
 */
const resolveFeeStructure = async (adminId, sessionId, { classId, streamId = null, groupId = null }) => {
    if (!sessionId || !classId) return null;
    const base = { adminId, sessionId: toObjectId(sessionId), classId: toObjectId(classId), streamId: toObjectId(streamId) };
    const candidates = await FeeStructureModel
        .find({ ...base, groupId: { $in: groupId ? [toObjectId(groupId), null] : [null] } })
        .lean();
    const structure = (groupId && candidates.find((item) => String(item.groupId) === String(groupId)))
        || candidates.find((item) => item.groupId == null);
    if (!structure) return null;
    return { structure, totalFee: FeeStructureModel.totalOf(structure), admissionFee: structure.admissionFee || 0 };
};

/** Class Promotion's "no fee structure for the target class next session" warning check. */
const hasFeeStructure = async (adminId, classId, sessionId) => {
    if (!sessionId) return false;
    return Boolean(await FeeStructureModel.exists({ adminId, classId: toObjectId(classId), sessionId: toObjectId(sessionId) }));
};

module.exports = { resolveFeeStructure, hasFeeStructure };
