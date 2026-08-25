'use strict';
const LeaveRequestModel = require('../models/leave-request');
const PersonLeaveAssignmentModel = require('../models/person-leave-assignment');

// The two batched reads behind every balance number in the leave module.
//
// Both answer the same question for a SET of people at once — "how much of each type have
// they spent" and "what were they actually granted" — because all three callers work on a
// group: the approvals list decorates a whole page of requests, the entitlement grid renders
// a whole school, and bulk assign seeds a whole selection. A per-person helper would turn
// each of those into an N+1.
//
// WHICH NUMBER IS AUTHORITATIVE. getApprovedDaysByPerson is. An assignment's `usedDays` is a
// running counter kept in step by the approve/cancel/delete handlers and is only ever a
// convenience for the grid — see the header of models/person-leave-assignment.js. What an
// assignment DOES own is the allocation: `allocatedDays` is the per-person entitlement
// snapshot, and it is the cap the approval check spends against, falling back to the
// school-wide LeaveType.maxDaysPerYear for anyone never assigned.

// The composite key both maps are keyed on. Requests, assignments and grid cells all reduce
// to (who, which type), so one key shape lets a caller read both maps with one lookup.
const balanceKeyOf = (personType, personId, leaveTypeId) => `${personType}|${personId}|${leaveTypeId}`;

/**
 * Days already approved this year, per person per leave type.
 *
 * One indexed aggregation for the whole selection. `excludeIds` lets the approval path ask
 * "everything EXCEPT the request I am about to approve", so a request can never count itself
 * against its own balance.
 *
 * @param {String} adminId
 * @param {Array<{personType: String, personId: String}>} personKeys
 * @param {Number|Number[]} year one leave year, or every year a page of requests spans
 * @param {String[]} [excludeIds] LeaveRequest _ids to leave out of the sum
 * @returns {Promise<Map<String, Number>>} "personType|personId|leaveTypeId" -> days
 */
const getApprovedDaysByPerson = async (adminId, personKeys, year, excludeIds) => {
    if (!adminId || !Array.isArray(personKeys) || personKeys.length === 0) return new Map();

    const years = Array.isArray(year) ? [...new Set(year)] : [year];
    const match = {
        adminId,
        year: years.length === 1 ? years[0] : { $in: years },
        status: 'Approved',
        $or: personKeys.map(({ personType, personId }) => ({ personType, personId: String(personId) })),
    };
    if (Array.isArray(excludeIds) && excludeIds.length > 0) {
        match._id = { $nin: excludeIds };
    }

    const grouped = await LeaveRequestModel.aggregate([
        { $match: match },
        {
            $group: {
                _id: { personType: '$personType', personId: '$personId', leaveTypeId: '$leaveTypeId' },
                used: { $sum: '$dayCount' },
            },
        },
    ]);

    const usedByKey = new Map();
    for (const row of grouped) {
        usedByKey.set(balanceKeyOf(row._id.personType, row._id.personId, row._id.leaveTypeId), row.used);
    }
    return usedByKey;
};

/**
 * Entitlement rows for a set of people, keyed the same way as the used-days map above.
 *
 * One find over the unique { adminId, personType, personId, leaveTypeId } index. A person
 * with no row is simply absent — "never assigned this type" is a real state the grid renders
 * differently, so it must not be flattened into a zero.
 *
 * @param {String} adminId
 * @param {Array<{personType: String, personId: String}>} personKeys
 * @returns {Promise<Map<String, Object>>} "personType|personId|leaveTypeId" -> assignment
 */
const getAssignmentMap = async (adminId, personKeys) => {
    if (!adminId || !Array.isArray(personKeys) || personKeys.length === 0) return new Map();

    const assignments = await PersonLeaveAssignmentModel.find({
        adminId,
        $or: personKeys.map(({ personType, personId }) => ({ personType, personId: String(personId) })),
    }).lean();

    const assignmentByKey = new Map();
    for (const assignment of assignments) {
        assignmentByKey.set(
            balanceKeyOf(assignment.personType, assignment.personId, assignment.leaveTypeId),
            assignment,
        );
    }
    return assignmentByKey;
};

module.exports = { balanceKeyOf, getApprovedDaysByPerson, getAssignmentMap };
