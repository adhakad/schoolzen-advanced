'use strict';
const SalaryStructureModel = require('../models/salary-structure');
const SalaryGroupModel = require('../models/salary-group');
const StaffModel = require('../models/staff');
const logger = require('../helpers/logger');

// WHICH SCALE EACH STAFF MEMBER IS ON.
//
// The list this drives is STAFF-FIRST, not structure-first: the Assign Salary table has to
// show everybody, including the people who have not been assigned yet, because those are
// exactly the rows an admin came to the page to fix. Listing SalaryStructure rows instead
// would render an empty table on a school that has never assigned anybody, which reads as a
// broken page rather than as work to do.

// ---------------------------------------------------------------------------
// POST /assign-salary-pagination
// One page of ACTIVE staff, each carrying their current assignment or null.
//
// Three queries per page regardless of page size — the staff page, then the structures for
// exactly those ids, then the groups those structures name. Never one lookup per row.
// ---------------------------------------------------------------------------
let GetAssignSalaryPagination = async (req, res, next) => {
    const adminId = req.body.adminId;
    const searchText = req.body.filters ? req.body.filters.searchText : '';
    // Only active staff: an inactive staff member is not being paid, and offering to assign
    // them a scale is noise on the one screen that exists to find the unassigned.
    const staffFilter = { adminId: adminId, status: 'active' };
    if (searchText) {
        staffFilter.name = new RegExp(`${searchText.toString().trim()}`, 'i');
    }

    try {
        const limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
        const page = req.body.page || 1;

        const [staffList, countStaff] = await Promise.all([
            StaffModel.find(staffFilter).sort({ name: 1 })
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .lean(),
            StaffModel.count(staffFilter),
        ]);

        const staffIds = staffList.map((staff) => staff._id.toString());
        const structures = staffIds.length > 0
            ? await SalaryStructureModel.find({ adminId: adminId, staffId: { $in: staffIds } }).lean()
            : [];

        const structureByStaffId = new Map(
            structures.map((structure) => [String(structure.staffId), structure]),
        );

        // Only the groups this page actually references — a school with twenty scales and
        // three on screen pays for the three.
        const groupIds = [...new Set(structures.map((structure) => String(structure.salaryGroupId)))];
        const groups = groupIds.length > 0
            ? await SalaryGroupModel.find({ _id: { $in: groupIds } }, { name: 1, calculationMode: 1 }).lean()
            : [];
        const groupById = new Map(groups.map((group) => [group._id.toString(), group]));

        const assignList = staffList.map((staff) => {
            const structure = structureByStaffId.get(staff._id.toString()) || null;
            const group = structure ? groupById.get(String(structure.salaryGroupId)) : null;
            return {
                staffId: staff._id,
                name: staff.name,
                empCode: staff.empCode || '',
                structureId: structure ? structure._id : null,
                salaryGroupId: structure ? structure.salaryGroupId : null,
                // Empty rather than a placeholder string — the frontend renders "Not assigned"
                // so the wording lives in one place with the rest of the UI copy.
                salaryGroupName: group ? group.name : '',
                calculationMode: group ? group.calculationMode : '',
                effectiveFrom: structure ? structure.effectiveFrom : null,
                // Enough for the row to show an "Overridden" hint without shipping the whole
                // override payload to a table that would not render it.
                hasOverride: !!(structure && (
                    structure.overrideBasic !== null && structure.overrideBasic !== undefined
                    || structure.overrideHra !== null && structure.overrideHra !== undefined
                    || Array.isArray(structure.overrideAllowances)
                    || Array.isArray(structure.overrideDeductions)
                )),
            };
        });

        return res.json({ assignList: assignList, countStaff: countStaff });
    } catch (error) {
        logger.error('salary-structure.GetAssignSalaryPagination', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// The edit form reads this to pre-fill the group and any overrides. Returns null (200, not
// 404) for an unassigned staff member — "no assignment yet" is the normal state on this page,
// not an error.
let GetSingleSalaryStructure = async (req, res, next) => {
    try {
        const { adminId, staffId } = req.params;
        const structure = await SalaryStructureModel.findOne({ adminId: adminId, staffId: staffId }).lean();
        return res.status(200).json(structure || null);
    } catch (error) {
        logger.error('salary-structure.GetSingleSalaryStructure', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// Loaded once and reused by both assign handlers, so a bulk assign and a single one can never
// disagree about whether a group is usable.
const loadAssignableGroup = async (adminId, salaryGroupId) => {
    const group = await SalaryGroupModel.findOne({ _id: salaryGroupId, adminId: adminId }).lean();
    if (!group) return { error: 'Salary group not found!' };
    // A retired scale must not be assigned to anybody new. Existing assignments keep it, and
    // existing Payroll rows keep their snapshot of it.
    if (group.status !== 'active') return { error: 'This salary group is inactive and cannot be assigned!' };
    return { group };
};

// ---------------------------------------------------------------------------
// POST /
// Assign (or re-assign) ONE staff member. An UPSERT, not an insert: models/salary-structure.js
// holds one current assignment per person, so re-assigning replaces rather than colliding
// with the unique index.
// ---------------------------------------------------------------------------
let AssignSalary = async (req, res, next) => {
    try {
        const {
            adminId, staffId, salaryGroupId, effectiveFrom,
            overrideBasic, overrideHra, overrideAllowances, overrideDeductions,
        } = req.body;

        const staff = await StaffModel.findOne({ _id: staffId, adminId: adminId }, { _id: 1 }).lean();
        if (!staff) {
            return res.status(404).json('Staff member not found!');
        }

        const { group, error } = await loadAssignableGroup(adminId, salaryGroupId);
        if (error) return res.status(400).json(error);

        await SalaryStructureModel.findOneAndUpdate(
            { adminId: adminId, staffId: staffId },
            {
                $set: {
                    salaryGroupId: group._id.toString(),
                    effectiveFrom: effectiveFrom,
                    // Written verbatim, including nulls. null is the instruction "use the
                    // group value" and 0 is the instruction "this person gets none" — see
                    // models/salary-structure.js. Coercing either into the other here is the
                    // one mistake in this file that would silently pay somebody wrongly.
                    overrideBasic: overrideBasic === undefined ? null : overrideBasic,
                    overrideHra: overrideHra === undefined ? null : overrideHra,
                    overrideAllowances: overrideAllowances === undefined ? null : overrideAllowances,
                    overrideDeductions: overrideDeductions === undefined ? null : overrideDeductions,
                },
                $setOnInsert: { adminId: adminId, staffId: staffId, createdAt: new Date() },
            },
            { upsert: true, new: true },
        );

        return res.status(200).json('Salary group assigned successfully.');
    } catch (error) {
        logger.error('salary-structure.AssignSalary', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// POST /bulk-assign
// N staff, ONE group, one round trip — same shape as BulkAssignHoliday in
// controllers/holiday-assignment.js, including the unordered bulkWrite and the summary log.
//
// No overrides here, deliberately: a value that applied to every person in the selection
// belongs in the group itself. See validators/salary-structure.js.
// ---------------------------------------------------------------------------
let BulkAssignSalary = async (req, res, next) => {
    try {
        const { adminId, salaryGroupId, effectiveFrom, staffIds } = req.body;

        const { group, error } = await loadAssignableGroup(adminId, salaryGroupId);
        if (error) return res.status(400).json(error);

        // Every id verified against this school in ONE query. A selection containing somebody
        // else school staff id is a bug or an attack; either way it must not write a row.
        const uniqueStaffIds = [...new Set(staffIds.map(String))];
        const staffList = await StaffModel
            .find({ _id: { $in: uniqueStaffIds }, adminId: adminId }, { _id: 1 })
            .lean();
        if (staffList.length === 0) {
            return res.status(400).json('No valid staff member found in this selection!');
        }

        const writeOps = staffList.map((staff) => ({
            updateOne: {
                filter: { adminId: adminId, staffId: staff._id.toString() },
                update: {
                    $set: {
                        salaryGroupId: group._id.toString(),
                        effectiveFrom: effectiveFrom,
                        // A bulk assign CLEARS any previous per-person override. Leaving them
                        // in place would mean twelve people put on one scale silently getting
                        // twelve different salaries, which is the opposite of what the action
                        // says it does.
                        overrideBasic: null,
                        overrideHra: null,
                        overrideAllowances: null,
                        overrideDeductions: null,
                    },
                    $setOnInsert: {
                        adminId: adminId,
                        staffId: staff._id.toString(),
                        createdAt: new Date(),
                    },
                },
                upsert: true,
            },
        }));

        const result = await SalaryStructureModel.bulkWrite(writeOps, { ordered: false });

        logger.info('salary-structure.bulkAssigned', {
            adminId: adminId,
            salaryGroupId: group._id.toString(),
            requested: uniqueStaffIds.length,
            matched: staffList.length,
            upserted: result.upsertedCount,
            modified: result.modifiedCount,
        });

        return res.status(200).json(`Salary group assigned to ${staffList.length} staff member(s).`);
    } catch (error) {
        logger.error('salary-structure.BulkAssignSalary', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// Removing an assignment, not a staff member. Generated Payroll rows are untouched — they
// snapshotted their own numbers and stay readable; only the NEXT generation is blocked, which
// is exactly what removing the assignment means.
let DeleteSalaryStructure = async (req, res, next) => {
    try {
        const id = req.params.id;
        await SalaryStructureModel.findByIdAndRemove(id);
        return res.status(200).json('Salary assignment removed successfully.');
    } catch (error) {
        logger.error('salary-structure.DeleteSalaryStructure', error);
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    GetAssignSalaryPagination,
    GetSingleSalaryStructure,
    AssignSalary,
    BulkAssignSalary,
    DeleteSalaryStructure,
}
