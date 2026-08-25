'use strict';
const PersonLeaveAssignmentModel = require('../models/person-leave-assignment');
const LeaveTypeModel = require('../models/leave-type');
const DepartmentModel = require('../models/department');
const { getActivePeople, personCode } = require('../services/person-lookup');
const { getApprovedDaysByPerson } = require('../services/leave-balance');
const logger = require('../helpers/logger');
const { getClassDisplayName } = require('../helpers/format-class-name');

// Entitlement, in bulk. Two endpoints, both read-mostly:
//
//   GET  /grid        — everyone of one type, with every active leave type as a column.
//   POST /bulk-assign — give N people M leave types in one action.
//
// NOTHING HERE DECIDES A LEAVE. Approval still runs entirely through
// controllers/leave-request.js, and the balance it enforces is still derived from Approved
// requests, not from these rows — see the header of models/person-leave-assignment.js.
// This module can be wrong without an approval ever going wrong.

// The used-days seed below and the balance strip on the approvals list are the same
// aggregation, so it lives in services/leave-balance.js and both read it from there.

// ---------------------------------------------------------------------------
// GET /grid?adminId=&personType=&class=
//
// Two queries for the people and their assignments, one for the leave types, one for
// departments — joined in memory. Never a query per person: a 300-staff school costs the
// same four round-trips a 3-staff one does.
//
// Returns { leaveTypes, rows } rather than the bare row array: the columns and the balance
// keys have to come from the same read, or a leave type created between the two calls
// renders as a column with no cell under it.
// ---------------------------------------------------------------------------
let GetLeaveAssignmentGrid = async (req, res, next) => {
    const { adminId, personType } = req.query;
    try {
        if (!adminId || !['student', 'teacher', 'staff'].includes(personType)) {
            return res.status(400).json('School and a valid person type are required!');
        }

        // Same rule the attendance grid and live board already enforce: a whole school's
        // roll is not a usable grid, so students are listed class by class.
        if (personType === 'student' && !req.query.class) {
            return res.status(400).json('Select a class to view student leave balances!');
        }
        const extra = {};
        if (personType === 'student') extra.class = req.query.class;

        const [people, leaveTypes] = await Promise.all([
            getActivePeople(adminId, personType, extra),
            LeaveTypeModel.find({
                adminId,
                status: 'active',
                applicableTo: { $in: ['all', personType] },
            }).sort({ name: 1 }).lean(),
        ]);

        if (people.length === 0) return res.status(200).json({ leaveTypes, rows: [] });

        const personIds = people.map((person) => String(person._id));
        // Departments are a staff-only concept — teachers and students carry no
        // departmentId, so the lookup is skipped entirely for them rather than firing a
        // query that can only come back empty.
        const departmentIds = personType === 'staff'
            ? [...new Set(people.map((person) => person.departmentId).filter(Boolean))]
            : [];

        const [assignments, departments] = await Promise.all([
            PersonLeaveAssignmentModel.find({
                adminId,
                personType,
                personId: { $in: personIds },
            }).lean(),
            departmentIds.length > 0
                ? DepartmentModel.find({ _id: { $in: departmentIds } }, { name: 1 }).lean()
                : [],
        ]);

        const assignmentByKey = new Map();
        for (const assignment of assignments) {
            assignmentByKey.set(`${assignment.personId}|${assignment.leaveTypeId}`, assignment);
        }
        const departmentById = new Map(departments.map((department) => [department._id.toString(), department.name]));

        const rows = people.map((person) => {
            const personId = String(person._id);
            const balances = {};
            for (const leaveType of leaveTypes) {
                const assignment = assignmentByKey.get(`${personId}|${leaveType._id.toString()}`);
                // null, not a zeroed object: "never assigned this type" and "assigned zero
                // days" are different states, and the grid renders them differently.
                balances[leaveType._id.toString()] = assignment
                    ? { allocated: assignment.allocatedDays, used: assignment.usedDays }
                    : null;
            }

            let department = '';
            if (personType === 'staff') {
                department = departmentById.get(String(person.departmentId)) || '';
            } else if (personType === 'student') {
                // Students have no department. Their class is the equivalent org unit, and
                // an always-blank column would be worse than none.
                //
                // Through getClassDisplayName, never the raw number: 200/201/202 are the
                // stored values for Nursery/LKG/UKG, so `Class ${person.class}` was putting
                // "Class 200" in front of the user. Same helper the rest of the backend uses.
                department = person.class != null ? getClassDisplayName(Number(person.class)) : '';
            }

            return {
                personId,
                name: person.name,
                code: personCode(personType, person),
                department,
                balances,
            };
        });

        return res.status(200).json({ leaveTypes, rows });
    } catch (error) {
        logger.error('leave-assignment.GetLeaveAssignmentGrid', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// POST /bulk-assign
// Body: { adminId, leaveTypeIds: [String], persons: [{ personType, personId }] }
//
// IDEMPOTENT BY CONSTRUCTION. Every write is an upsert whose update body is $setOnInsert
// only, so a row that already exists is matched and then left completely alone — re-running
// the same selection cannot reset anybody's usedDays. That is also why the response
// separates assignedCount from skippedCount: the admin needs to know the second run did
// nothing rather than assume it re-granted everything.
// ---------------------------------------------------------------------------
let BulkAssignLeave = async (req, res, next) => {
    const { adminId, leaveTypeIds, persons } = req.body;
    try {
        const uniqueTypeIds = [...new Set(leaveTypeIds.map(String))];
        // De-duplicated: the same person arriving twice in the selection would otherwise
        // produce two writes racing on one unique index for no reason.
        const personByKey = new Map();
        for (const person of persons) {
            personByKey.set(`${person.personType}|${person.personId}`, person);
        }
        const uniquePersons = [...personByKey.values()];

        const leaveTypes = await LeaveTypeModel.find({
            _id: { $in: uniqueTypeIds },
            adminId: adminId,
        }).lean();

        // Fail fast with a specific message, the way the rest of this codebase reports a
        // business-rule conflict, rather than silently assigning the subset that happened
        // to be valid.
        if (leaveTypes.length !== uniqueTypeIds.length) {
            return res.status(404).json('One or more leave types were not found!');
        }
        const inactive = leaveTypes.find((leaveType) => leaveType.status !== 'active');
        if (inactive) {
            return res.status(400).json(`${inactive.name} is inactive and cannot be assigned!`);
        }

        const selectedTypes = new Set(uniquePersons.map((person) => person.personType));
        for (const leaveType of leaveTypes) {
            if (leaveType.applicableTo === 'all') continue;
            const mismatch = [...selectedTypes].find((personType) => personType !== leaveType.applicableTo);
            if (mismatch) {
                return res.status(400).json(`${leaveType.name} does not apply to a ${mismatch}!`);
            }
        }

        // Seed usedDays from what has actually been approved this year — see the helper.
        const year = new Date().getFullYear();
        const usedByKey = await getApprovedDaysByPerson(adminId, uniquePersons, year);

        const now = new Date();
        const writeOps = [];
        for (const person of uniquePersons) {
            for (const leaveType of leaveTypes) {
                const typeId = leaveType._id.toString();
                writeOps.push({
                    updateOne: {
                        // Exactly the unique index, so each upsert is a direct index hit.
                        filter: {
                            adminId: adminId,
                            personType: person.personType,
                            personId: person.personId,
                            leaveTypeId: typeId,
                        },
                        update: {
                            // $setOnInsert ONLY. An existing row must survive untouched —
                            // its allocatedDays may have been granted under a different cap
                            // and its usedDays is real spend.
                            $setOnInsert: {
                                adminId: adminId,
                                personType: person.personType,
                                personId: person.personId,
                                leaveTypeId: typeId,
                                allocatedDays: leaveType.maxDaysPerYear,
                                usedDays: usedByKey.get(`${person.personType}|${person.personId}|${typeId}`) || 0,
                                createdAt: now,
                            },
                        },
                        upsert: true,
                    },
                });
            }
        }

        // ordered:false so one racing duplicate (two admins assigning at once) cannot abort
        // the rest of the batch — the unique index turns that race into a no-op, which is
        // the correct outcome here anyway.
        const result = await PersonLeaveAssignmentModel.bulkWrite(writeOps, { ordered: false });
        const assignedCount = result.upsertedCount || 0;
        const skippedCount = writeOps.length - assignedCount;

        logger.info('leave-assignment.bulkAssigned', {
            adminId,
            personCount: uniquePersons.length,
            typeCount: leaveTypes.length,
            assignedCount,
            skippedCount,
        });
        return res.status(200).json({ assignedCount, skippedCount });
    } catch (error) {
        logger.error('leave-assignment.BulkAssignLeave', error);
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    GetLeaveAssignmentGrid,
    BulkAssignLeave,
}
