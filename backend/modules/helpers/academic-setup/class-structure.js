'use strict';
const mongoose = require('mongoose');
const SubjectGroupModel = require('../../models/academic-setup/subject-group');
const { ValidationError, ConflictError } = require('../../errors');
const { groupBlockingCounts, sectionBlockingCounts } = require('./dependents');

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
//    class gets exactly one automatic "General" group (`isSystemGroup: true`). The Class
//    modal only NAMES a group — its subjects are picked solely on the Subject Groups page —
//    so a save here never sets or changes a group's subjectIds.
// 3. hasStreams is derived from the class number (11th/12th only), never trusted from the
//    client (classes-sections.md).

const MODULE = 'academic-setup';
const GENERAL_GROUP_NAME = 'General';

// Streaming (Science/Commerce/Arts) is a fixed fact of 11th and 12th, not a school choice.
const STREAMED_CLASSES = [11, 12];
const classHasStreams = (classNumber) => STREAMED_CLASSES.indexOf(Number(classNumber)) !== -1;

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

/**
 * Bring the class's SubjectGroups in line with the saved structure, inside `dbSession`:
 *   - streamed: each stream's groups upserted (kept by `_id`, else by name within that
 *     stream) — NAME ONLY: a new group starts with `subjectIds: []`, an existing one keeps
 *     whatever subjects the Subject Groups page gave it; groups of this class not in the
 *     payload — a removed group, a removed stream's groups, a leftover "General" — deleted.
 *   - non-streamed: every stream group deleted, and exactly one "General" system group
 *     ensured (created once, never duplicated on a later save).
 */
/**
 * A group any StudentEnrollment is placed on is never deleted as a side effect of a Class
 * save (SUBJECT_GROUP_IN_USE — the same hard block as the Subject Groups page's own delete):
 * that would leave enrollments pointing at a group that no longer exists. One grouped count
 * for the whole removal set (helpers/academic-setup/dependents.js), never a query per group.
 */
const assertGroupsRemovable = async (adminId, groups) => {
    if (!groups.length) return;
    const counts = await groupBlockingCounts(adminId, groups.map((group) => group._id));
    const blocked = groups.filter((group) => counts.get(String(group._id)));
    if (!blocked.length) return;
    const blockingCount = blocked.reduce((sum, group) => sum + counts.get(String(group._id)), 0);
    const names = blocked.map((group) => `"${group.name}"`).join(', ');
    const message = `${blockingCount} ${blockingCount === 1 ? 'student is' : 'students are'} placed in group ${names} — reassign them before removing ${blocked.length === 1 ? 'it' : 'them'} (or its stream).`;
    throw new ConflictError(message, {
        module: MODULE,
        code: 'SUBJECT_GROUP_IN_USE',
        fields: [{ field: 'groups', message }],
        context: { blockingCount, groupIds: blocked.map((group) => String(group._id)) },
    });
};

/**
 * An 11th/12th saved before streams were mandatory still holds sections on the class itself.
 * A streamed save stores none there, so those sections would vanish — never silently:
 *   - any section a StudentEnrollment is placed in is a hard block (CLASS_SECTIONS_IN_USE),
 *     the same rule as removing an in-use group;
 *   - otherwise the save must say it means it (`confirmRemoveSections`), which the modal only
 *     sends after the admin confirms (CLASS_SECTIONS_UNCONFIRMED).
 */
const assertFlatSectionsRemovable = async (adminId, existingDoc, hasStreams, confirmed) => {
    const flat = hasStreams && existingDoc ? (existingDoc.sections || []) : [];
    if (!flat.length) return;
    const label = (sections) => `section${sections.length === 1 ? '' : 's'} ${sections.map((section) => `"${section.name}"`).join(', ')}`;
    const counts = await sectionBlockingCounts(adminId, flat.map((section) => section._id));
    const inUse = flat.filter((section) => counts.get(String(section._id)));
    const blockingCount = inUse.reduce((sum, section) => sum + counts.get(String(section._id)), 0);
    if (blockingCount) {
        const message = `${blockingCount} ${blockingCount === 1 ? 'student is' : 'students are'} placed in ${label(inUse)}, outside any stream — reassign them before saving this class with streams.`;
        throw new ConflictError(message, {
            module: MODULE,
            code: 'CLASS_SECTIONS_IN_USE',
            fields: [{ field: 'sections', message }],
            context: { blockingCount, sectionIds: flat.map((section) => String(section._id)) },
        });
    }
    if (!confirmed) {
        const message = `S${label(flat).slice(1)} ${flat.length === 1 ? 'is' : 'are'} outside any stream and will be removed when this class is saved with streams — confirm to continue.`;
        throw new ConflictError(message, {
            module: MODULE,
            code: 'CLASS_SECTIONS_UNCONFIRMED',
            fields: [{ field: 'sections', message }],
        });
    }
};

const syncClassGroups = async ({ dbSession, adminId, classId, hasStreams, groupsByStream }) => {
    const existing = await SubjectGroupModel.find({ adminId, classId }).session(dbSession).lean();

    if (!hasStreams) {
        const general = existing.find((group) => group.isSystemGroup);
        const staleGroups = existing.filter((group) => !group.isSystemGroup);
        await assertGroupsRemovable(adminId, staleGroups);
        const stale = staleGroups.map((group) => group._id);
        if (stale.length) await SubjectGroupModel.deleteMany({ _id: { $in: stale } }, { session: dbSession });
        if (!general) {
            await SubjectGroupModel.create([{
                adminId, classId, streamId: null, name: GENERAL_GROUP_NAME, subjectIds: [], isSystemGroup: true,
            }], { session: dbSession });
        }
        return;
    }

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
            // Never touch subjectIds here: the Class modal has no subject checklist, so an
            // edit that rewrote them would wipe what the Subject Groups page assigned.
            if (current) {
                await SubjectGroupModel.updateOne({ _id: current._id }, { $set: { name: group.name } }, { session: dbSession });
            } else {
                await SubjectGroupModel.create([{ _id: group._id, adminId, classId, streamId, name: group.name, subjectIds: [] }], { session: dbSession });
            }
        }
    }
    const removedGroups = existing.filter((group) => !keep.has(String(group._id)));
    await assertGroupsRemovable(adminId, removedGroups);
    const removed = removedGroups.map((group) => group._id);
    if (removed.length) await SubjectGroupModel.deleteMany({ _id: { $in: removed } }, { session: dbSession });
};

module.exports = { GENERAL_GROUP_NAME, STREAMED_CLASSES, classHasStreams, keepIds, planStructure, assertFlatSectionsRemovable, syncClassGroups };
