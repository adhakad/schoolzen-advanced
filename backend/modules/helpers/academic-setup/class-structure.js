'use strict';
const mongoose = require('mongoose');
const SubjectGroupModel = require('../../models/academic-setup/subject-group');
const SubjectModel = require('../../models/academic-setup/subject');
const { ValidationError } = require('../../errors');

// How a Class save turns the modal's payload into stored structure — shared by Create and
// Update in controllers/academic-setup/classes-sections.controller.js.
//
// 1. IDs are KEPT. Sections, streams and groups are referenced by id from everywhere —
//    StudentEnrollment.sectionId/streamId/groupId, SubjectGroup.streamId, FeeStructure — so
//    an edit must never re-mint them. The old UpdateClass replaced the arrays wholesale
//    from name-only payloads, giving every section a new id on every save: every student's
//    placement pointed at an id that no longer existed, and the Section/Group filters came
//    back empty (student-fix5.md #6). An incoming item keeps an existing id when it sends
//    that `_id`, or — for a client that sends names only — when its normalized name matches.
// 2. Groups live with their stream (classes-sections.md): a streamed class's streams each
//    carry ≥1 SubjectGroup, written in the same transaction as the class; a non-streamed
//    class gets exactly one automatic "General" group (`isSystemGroup: true`).

const MODULE = 'academic-setup';
const GENERAL_GROUP_NAME = 'General';

const newId = () => new mongoose.Types.ObjectId();
const keyOf = (value) => String(value || '').trim().toLowerCase();

/**
 * Give each incoming item the `_id` of the existing item it IS (same `_id`, else same
 * normalized name); a genuinely new item gets a fresh id. Pure.
 */
const keepIds = (existing = [], incoming = []) => {
    const byId = new Map(existing.map((item) => [String(item._id), item]));
    const byName = new Map(existing.map((item) => [keyOf(item.name), item]));
    const used = new Set();
    return incoming.map((item) => {
        let match = item._id && byId.get(String(item._id));
        if (!match) match = byName.get(keyOf(item.name));
        if (match && used.has(String(match._id))) match = null;   // one existing item, one owner
        const id = match ? match._id : newId();
        used.add(String(id));
        return { ...item, _id: id };
    });
};

/**
 * The class document's sections/streams for this save, with ids kept (see 1. above).
 * `existingDoc` is null on create. Groups are returned alongside, keyed by stream id.
 */
const planStructure = (existingDoc, body) => {
    if (!body.hasStreams) {
        return {
            sections: keepIds(existingDoc ? existingDoc.sections : [], body.sections || []).map(({ _id, name }) => ({ _id, name })),
            streams: [],
            groupsByStream: new Map(),
        };
    }
    const streams = keepIds(existingDoc ? existingDoc.streams : [], body.streams || []);
    const groupsByStream = new Map();
    const planned = streams.map((stream) => {
        const before = existingDoc && (existingDoc.streams || []).find((item) => String(item._id) === String(stream._id));
        groupsByStream.set(String(stream._id), stream.groups || []);
        return {
            _id: stream._id,
            name: stream.name,
            sections: keepIds(before ? before.sections : [], stream.sections || []).map(({ _id, name }) => ({ _id, name })),
        };
    });
    return { sections: [], streams: planned, groupsByStream };
};

/** Every subject a group names must be this school's. */
const assertSubjectsExist = async (adminId, groupsByStream, dbSession) => {
    const ids = [...new Set([...groupsByStream.values()].flat().flatMap((group) => (group.subjectIds || []).map(String)))];
    if (!ids.length) return;
    const found = await SubjectModel.countDocuments({ _id: { $in: ids }, adminId }).session(dbSession);
    if (found !== ids.length) {
        const message = `${ids.length - found} of the chosen subjects no longer exist — refresh and pick again.`;
        throw new ValidationError(message, { module: MODULE, fields: [{ field: 'subjectIds', message }] });
    }
};

/**
 * Bring the class's SubjectGroups in line with the saved structure, inside `dbSession`:
 *   - streamed: each stream's groups upserted (kept by `_id`, else by name within that
 *     stream); groups of this class not in the payload — a removed group, a removed
 *     stream's groups, a leftover "General" — deleted.
 *   - non-streamed: every stream group deleted, and exactly one "General" system group
 *     ensured (created once, never duplicated on a later save).
 */
const syncClassGroups = async ({ dbSession, adminId, classId, hasStreams, groupsByStream }) => {
    const existing = await SubjectGroupModel.find({ adminId, classId }).session(dbSession).lean();

    if (!hasStreams) {
        const general = existing.find((group) => group.isSystemGroup);
        const stale = existing.filter((group) => !group.isSystemGroup).map((group) => group._id);
        if (stale.length) await SubjectGroupModel.deleteMany({ _id: { $in: stale } }, { session: dbSession });
        if (!general) {
            await SubjectGroupModel.create([{
                adminId, classId, streamId: null, name: GENERAL_GROUP_NAME, subjectIds: [], isSystemGroup: true,
            }], { session: dbSession });
        }
        return;
    }

    await assertSubjectsExist(adminId, groupsByStream, dbSession);
    const keep = new Set();
    for (const [streamId, groups] of groupsByStream) {
        const inStream = existing.filter((group) => !group.isSystemGroup && String(group.streamId) === streamId);
        // A group id sent by the client must be a group of THIS class+stream — never a way
        // to pull another class's (or another school's) group into this one.
        const ownIds = new Set(inStream.map((group) => String(group._id)));
        const foreign = groups.find((group) => group._id && !ownIds.has(String(group._id)));
        if (foreign) {
            const message = `Group "${foreign.name}" doesn't belong to this stream — refresh and try again.`;
            throw new ValidationError(message, { module: MODULE, fields: [{ field: 'groups', message }] });
        }
        for (const group of keepIds(inStream, groups)) {
            const current = inStream.find((item) => String(item._id) === String(group._id));
            keep.add(String(group._id));
            const doc = { name: group.name, subjectIds: group.subjectIds || [] };
            if (current) {
                await SubjectGroupModel.updateOne({ _id: current._id }, { $set: doc }, { session: dbSession });
            } else {
                await SubjectGroupModel.create([{ _id: group._id, adminId, classId, streamId, ...doc }], { session: dbSession });
            }
        }
    }
    const removed = existing.filter((group) => !keep.has(String(group._id))).map((group) => group._id);
    if (removed.length) await SubjectGroupModel.deleteMany({ _id: { $in: removed } }, { session: dbSession });
};

module.exports = { GENERAL_GROUP_NAME, keepIds, planStructure, syncClassGroups };
