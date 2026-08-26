'use strict';
const HolidayAssignmentModel = require('../models/holiday-assignment');
const ClassHolidayAssignmentModel = require('../models/class-holiday-assignment');
const HolidayTemplateModel = require('../models/holiday-template');
const DepartmentModel = require('../models/department');
const StudentModel = require('../models/student');
const { getActivePeople, personCode } = require('../services/person-lookup');
const { toUtcMidnight, toDateKey } = require('../helpers/date-only');
const { nowWallClock } = require('../helpers/attendance-time');
const { getClassDisplayName } = require('../helpers/format-class-name');
const logger = require('../helpers/logger');

// WHO FOLLOWS WHICH HOLIDAY TEMPLATE. Two endpoints per scope, both read-mostly:
//
//   GET  /grid              — everyone (or every class) of one scope, with their template.
//   POST /bulk-assign       — give N staff/teachers one template in one action.
//   POST /bulk-assign-class — give N classes one template in one action.
//
// Staff and teachers are assigned individually; students are assigned by CLASS, mirroring
// models/class-shift.js. See models/holiday-assignment.js for why that split exists.
//
// NOTHING HERE WRITES DailyAttendance. The reconcile worker and the calendar reader resolve
// a person's template through services/holiday-lookup.js at read time, so an assignment
// change is visible the moment it lands — no cache, no backfill.

// ---------------------------------------------------------------------------
// INTERNAL — queue today's attendance recompute after an assignment changes.
//
// Lifted verbatim in spirit from controllers/class-shift.js enqueueReconcileToday, and for
// the same reason: a holiday assignment is one of the inputs services/attendance-status.js
// resolves a status from, so assigning (or re-assigning) a template silently invalidates
// every DailyAttendance row already written for today. Without this the calendar keeps
// showing Present/Late on a day that has just become a holiday until something unrelated
// re-reconciles it.
//
// Only TODAY is enqueued. An assignment notionally affects every past day too, but
// back-dating a month of recomputes off a settings edit would rewrite history the school has
// already seen. Today is the day still being collected, and it is the one that matters.
//
// Never throws: the rows are already committed and the request already succeeded, so a Redis
// blip must not turn that into a 500.
// ---------------------------------------------------------------------------
const enqueueReconcileToday = async (adminId) => {
    if (!adminId) return false;
    try {
        // Lazily required for the reason controllers/class-shift.js spells out:
        // queues/connection.js throws at require-time without Redis, and routes.js requires
        // this controller at boot.
        const { addReconcileJob } = require('../queues/attendance-reconcile-queue');
        // "Today" in the SCHOOL wall clock — a container running UTC would otherwise still
        // be on yesterday for the whole of the morning punch window.
        const dateKey = toDateKey(toUtcMidnight(nowWallClock()));
        await addReconcileJob(adminId, dateKey, { delay: 0 });
        logger.info('holiday-assignment.reconcileEnqueued', { adminId, dateKey });
        return true;
    } catch (error) {
        logger.error('holiday-assignment.reconcileEnqueueFailed', error);
        return false;
    }
};

// ---------------------------------------------------------------------------
// INTERNAL — the template the grid labels each row with, and the dropdown it offers.
// One query for the school's templates, joined in memory. Never a lookup per row.
// ---------------------------------------------------------------------------
const getTemplateIndex = async (adminId) => {
    const templates = await HolidayTemplateModel
        .find({ adminId: adminId }, { name: 1, holidayIds: 1 })
        .sort({ name: 1 })
        .lean();
    const templateById = new Map(templates.map((template) => [template._id.toString(), template]));
    const templateList = templates.map((template) => ({
        _id: template._id,
        name: template.name,
        holidayCount: (template.holidayIds || []).length,
    }));
    return { templateById, templateList };
};

// ---------------------------------------------------------------------------
// GET /grid?adminId=&personType=
//
// personType 'staff' | 'teacher' — one row per person.
// personType 'student'           — one row per CLASS, because that is the unit students are
//                                  assigned in. The row still carries a `personId`-shaped
//                                  key (the class value) so the frontend can drive both
//                                  shapes with one selection Set.
//
// Four round-trips regardless of headcount: people, assignments, templates, departments.
// A 300-staff school costs exactly what a 3-staff one does.
//
// Returns { templates, rows } rather than the bare rows: the dropdown's options and the
// rows' template names have to come from the same read, or a template created between two
// calls renders as a name the dropdown cannot offer.
// ---------------------------------------------------------------------------
let GetHolidayAssignmentGrid = async (req, res, next) => {
    const { adminId, personType } = req.query;
    try {
        if (!adminId || !['student', 'teacher', 'staff'].includes(personType)) {
            return res.status(400).json('School and a valid person type are required!');
        }

        const { templateById, templateList } = await getTemplateIndex(adminId);

        // ---- STUDENT SCOPE: rows are classes, not people ----------------------
        if (personType === 'student') {
            const [classes, assignments] = await Promise.all([
                // The classes this school actually runs, from its own student records —
                // not models/class.js, which is global and always returns the same 15 rows.
                // Same source controllers/class-shift.js GetClassOptions reads.
                StudentModel.distinct('class', { adminId: adminId }),
                ClassHolidayAssignmentModel.find({ adminId: adminId }).lean(),
            ]);

            const assignmentByClass = new Map(
                assignments.map((assignment) => [String(assignment.class), assignment]),
            );

            // One grouped count for every class at once, never a count per row.
            const countGroups = await StudentModel.aggregate([
                { $match: { adminId: adminId, status: 'Active' } },
                { $group: { _id: '$class', total: { $sum: 1 } } },
            ]);
            const countByClass = new Map(countGroups.map((group) => [String(group._id), group.total]));

            const rows = classes
                .filter((value) => value !== null && value !== undefined)
                .sort((a, b) => Number(a) - Number(b))
                .map((value) => {
                    const classKey = String(value);
                    const assignment = assignmentByClass.get(classKey);
                    const template = assignment ? templateById.get(String(assignment.templateId)) : null;
                    return {
                        // Named personId so the frontend's selection Set, toggleRow and
                        // bulk-assign wiring are identical across all three scopes.
                        personId: classKey,
                        name: getClassDisplayName(Number(classKey)),
                        code: '',
                        // The equivalent of the staff Department column: how many people
                        // this one row actually covers.
                        department: `${countByClass.get(classKey) || 0} students`,
                        assignmentId: assignment ? assignment._id : null,
                        templateId: template ? template._id : null,
                        templateName: template ? template.name : null,
                    };
                });

            return res.status(200).json({ templates: templateList, rows });
        }

        // ---- STAFF / TEACHER SCOPE: one row per person ------------------------
        const people = await getActivePeople(adminId, personType);
        if (people.length === 0) return res.status(200).json({ templates: templateList, rows: [] });

        const personIds = people.map((person) => String(person._id));
        // Departments are a staff-only concept — teachers carry no departmentId, so the
        // lookup is skipped entirely for them rather than firing a query that can only come
        // back empty. Same treatment controllers/leave-assignment.js gives it.
        const departmentIds = personType === 'staff'
            ? [...new Set(people.map((person) => person.departmentId).filter(Boolean))]
            : [];

        const [assignments, departments] = await Promise.all([
            HolidayAssignmentModel.find({
                adminId: adminId,
                personType: personType,
                personId: { $in: personIds },
            }).lean(),
            departmentIds.length > 0
                ? DepartmentModel.find({ _id: { $in: departmentIds } }, { name: 1 }).lean()
                : [],
        ]);

        const assignmentByPersonId = new Map(
            assignments.map((assignment) => [String(assignment.personId), assignment]),
        );
        const departmentById = new Map(
            departments.map((department) => [department._id.toString(), department.name]),
        );

        const rows = people.map((person) => {
            const personId = String(person._id);
            const assignment = assignmentByPersonId.get(personId);
            const template = assignment ? templateById.get(String(assignment.templateId)) : null;
            return {
                personId,
                name: person.name,
                code: personCode(personType, person),
                department: personType === 'staff'
                    ? (departmentById.get(String(person.departmentId)) || '')
                    : '',
                assignmentId: assignment ? assignment._id : null,
                // null, not an empty string: "not assigned" and "assigned to a template with
                // no name" are different states and the grid renders them differently.
                templateId: template ? template._id : null,
                templateName: template ? template.name : null,
            };
        });

        return res.status(200).json({ templates: templateList, rows });
    } catch (error) {
        logger.error('holiday-assignment.GetHolidayAssignmentGrid', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// POST /bulk-assign
// Body: { adminId, templateId, persons: [{ personType, personId }] }
//
// REPLACES, rather than skipping. Unlike controllers/leave-assignment.js — where a person
// legitimately holds several leave types and re-running must not reset anybody's usedDays —
// a person follows exactly ONE holiday calendar, and re-assigning is precisely how the Edit
// flow changes it. So the update body is $set, and the response separates newly assigned
// from re-pointed so the admin can tell what actually happened.
// ---------------------------------------------------------------------------
let BulkAssignHoliday = async (req, res, next) => {
    const { adminId, templateId, persons } = req.body;
    try {
        const template = await HolidayTemplateModel.findOne({
            _id: templateId,
            adminId: adminId,
        }).lean();
        // Fail fast with a specific message, the way the rest of this codebase reports a
        // business-rule conflict, rather than writing rows that point at nothing.
        if (!template) {
            return res.status(404).json('Holiday template was not found!');
        }

        // De-duplicated: the same person arriving twice in the selection would otherwise
        // produce two writes racing on one unique index for no reason.
        const personByKey = new Map();
        for (const person of persons) {
            personByKey.set(`${person.personType}|${person.personId}`, person);
        }
        const uniquePersons = [...personByKey.values()];

        const now = new Date();
        const writeOps = uniquePersons.map((person) => ({
            updateOne: {
                // Exactly the unique index, so each upsert is a direct index hit.
                filter: {
                    adminId: adminId,
                    personType: person.personType,
                    personId: person.personId,
                },
                update: {
                    $set: { templateId: String(templateId), assignedAt: now },
                    $setOnInsert: {
                        adminId: adminId,
                        personType: person.personType,
                        personId: person.personId,
                    },
                },
                upsert: true,
            },
        }));

        // ordered:false so one racing duplicate (two admins assigning at once) cannot abort
        // the rest of the batch — the unique index turns that race into a no-op, which is
        // the correct outcome here anyway.
        const result = await HolidayAssignmentModel.bulkWrite(writeOps, { ordered: false });
        const assignedCount = result.upsertedCount || 0;
        const updatedCount = writeOps.length - assignedCount;

        // A day that has just become (or stopped being) a holiday needs recomputing — see
        // the helper. Deliberately after the write and deliberately not awaited into the
        // response's success, so a Redis blip cannot fail an assignment that already landed.
        await enqueueReconcileToday(adminId);

        logger.info('holiday-assignment.bulkAssigned', {
            adminId,
            templateId: String(templateId),
            personCount: uniquePersons.length,
            assignedCount,
            updatedCount,
        });
        return res.status(200).json({ assignedCount, updatedCount });
    } catch (error) {
        logger.error('holiday-assignment.BulkAssignHoliday', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// POST /bulk-assign-class
// Body: { adminId, templateId, classes: [String] }
//
// The student half. One row per class covers the whole cohort, so assigning class 5 reaches
// every student in it without a single per-student write. Same $set-replaces semantics as
// BulkAssignHoliday above.
// ---------------------------------------------------------------------------
let BulkAssignClassHoliday = async (req, res, next) => {
    const { adminId, templateId, classes } = req.body;
    try {
        const template = await HolidayTemplateModel.findOne({
            _id: templateId,
            adminId: adminId,
        }).lean();
        if (!template) {
            return res.status(404).json('Holiday template was not found!');
        }

        // String() on both sides for the reason models/class-shift.js gives: student.class
        // is a Number while the assignment stores a String, and neither has to know about
        // the other's type.
        const uniqueClasses = [...new Set(classes.map(String))];

        const now = new Date();
        const writeOps = uniqueClasses.map((classKey) => ({
            updateOne: {
                filter: { adminId: adminId, class: classKey },
                update: {
                    $set: { templateId: String(templateId), assignedAt: now },
                    $setOnInsert: { adminId: adminId, class: classKey },
                },
                upsert: true,
            },
        }));

        const result = await ClassHolidayAssignmentModel.bulkWrite(writeOps, { ordered: false });
        const assignedCount = result.upsertedCount || 0;
        const updatedCount = writeOps.length - assignedCount;

        await enqueueReconcileToday(adminId);

        logger.info('holiday-assignment.bulkAssignedClass', {
            adminId,
            templateId: String(templateId),
            classCount: uniqueClasses.length,
            assignedCount,
            updatedCount,
        });
        return res.status(200).json({ assignedCount, updatedCount });
    } catch (error) {
        logger.error('holiday-assignment.BulkAssignClassHoliday', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// The un-assign path: the person keeps working, they simply follow no holiday calendar any
// more. Their map goes empty and their non-punch days go back to Absent — see
// models/holiday-assignment.js on why that is the right default.
let DeleteHolidayAssignment = async (req, res, next) => {
    try {
        const assignment = await HolidayAssignmentModel.findByIdAndRemove(req.params.id);
        if (!assignment) return res.status(404).json('Assignment not found!');
        await enqueueReconcileToday(assignment.adminId);
        return res.status(200).json('Holiday template removed successfully.');
    } catch (error) {
        logger.error('holiday-assignment.DeleteHolidayAssignment', error);
        return res.status(500).json('Internal Server Error!');
    }
}

let DeleteClassHolidayAssignment = async (req, res, next) => {
    try {
        const assignment = await ClassHolidayAssignmentModel.findByIdAndRemove(req.params.id);
        if (!assignment) return res.status(404).json('Assignment not found!');
        await enqueueReconcileToday(assignment.adminId);
        return res.status(200).json('Holiday template removed successfully.');
    } catch (error) {
        logger.error('holiday-assignment.DeleteClassHolidayAssignment', error);
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    GetHolidayAssignmentGrid,
    BulkAssignHoliday,
    BulkAssignClassHoliday,
    DeleteHolidayAssignment,
    DeleteClassHolidayAssignment,
}
