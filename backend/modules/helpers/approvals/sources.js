'use strict';
const LeaveRequestV2Model = require('../../models/leave/leave-request');
const { describePeople, loadLeaveTypes } = require('../leave/context');
const { approveLeaveRequest, rejectLeaveRequest } = require('../../controllers/leave/leave-requests.controller');
const { leaveDetail, personCode } = require('./approval-rules');

// Every module that produces approvable requests, as one descriptor each (approvals.md:
// "adding a source means adding one more entry to union in, not rearchitecting this page").
//
// Contract every source honours:
//   - its collection has adminId + an indexed createdAt (the union's common sort key);
//   - `match()` builds the per-source $match on its OWN fields (inbox status → its status);
//   - `project` maps a document to the common shape { _id, type, personType, personId,
//     status (lowercase inbox status), createdAt, ...detail fields };
//   - `describe()` turns projected rows into table rows, batched;
//   - `approve` / `reject` ARE the source module's own actions (never a copy), and
//     `codeMap` translates its "gone"/"already actioned" codes to the inbox's two codes;
//   - `permission` is the source's own edit grant, required on top of 'approvals-action'.

const leaveSource = {
    type: 'leave',
    label: 'Leave',
    permission: 'leave',
    model: LeaveRequestV2Model,
    // Cancelled ("taken back") leaves were approved and then reversed — history for Leave
    // Requests, not something waiting on anyone's sign-off, so the inbox leaves them out.
    statusMap: { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' },
    match({ adminId, sessionId, status, personType, personIds }) {
        const filter = {
            adminId,
            sessionId,
            status: status ? this.statusMap[status] : { $in: Object.values(this.statusMap) },
        };
        if (personType) filter.personType = personType;
        if (personIds) filter.personId = { $in: personIds };
        return filter;
    },
    project: {
        _id: 1,
        type: { $literal: 'leave' },
        personType: 1,
        personId: 1,
        status: { $toLower: '$status' },
        createdAt: 1,
        sessionId: 1,
        leaveTypeId: 1,
        fromDateKey: 1,
        toDateKey: 1,
        days: 1,
        reason: 1,
    },
    async describe(adminId, sessionId, rows) {
        const [people, types] = await Promise.all([
            describePeople(adminId, sessionId, rows.map((row) => ({ personType: row.personType, personId: row.personId }))),
            loadLeaveTypes(adminId),
        ]);
        const typeNames = new Map(types.map((row) => [String(row._id), row.name]));
        return rows.map((row) => {
            const person = people.get(`${row.personType}|${row.personId}`) || null;
            const typeName = typeNames.get(String(row.leaveTypeId)) || '';
            return {
                _id: String(row._id),
                type: 'leave',
                typeLabel: this.label,
                personType: row.personType,
                personId: row.personId,
                name: (person && person.name) || 'Unknown',
                code: personCode(row.personType, person),
                details: leaveDetail(typeName, row.fromDateKey, row.toDateKey, row.days),
                status: row.status,
                createdAt: row.createdAt,
                info: {
                    leaveType: typeName || null,
                    fromDate: row.fromDateKey,
                    toDate: row.toDateKey,
                    days: row.days,
                    reason: row.reason || null,
                },
            };
        });
    },
    // The SAME functions Leave Requests' own Approve/Reject buttons run. No balance override
    // from the inbox: an over-balance request is decided on Leave Requests.
    approve: (req, { adminId, id }) => approveLeaveRequest(req, { adminId, id, forceApprove: false }),
    reject: (req, { adminId, id }) => rejectLeaveRequest(req, { adminId, id }),
    codeMap: {
        LEAVE_REQUEST_NOT_FOUND: 'REQUEST_NOT_FOUND',
        LEAVE_NOT_PENDING: 'REQUEST_NOT_PENDING',
        LEAVE_ALREADY_ACTIONED: 'REQUEST_NOT_PENDING',
    },
};

const SOURCES = Object.freeze([leaveSource]);
const SOURCE_TYPES = Object.freeze(SOURCES.map((source) => source.type));

/** The descriptor for a row's `type`, or null — a stale/malformed tag is REQUEST_NOT_FOUND. */
const sourceFor = (type) => SOURCES.find((source) => source.type === type) || null;

module.exports = { SOURCES, SOURCE_TYPES, sourceFor };
