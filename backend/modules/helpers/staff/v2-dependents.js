'use strict';
const StaffV2Model = require('../../models/staff/staff');
const DesignationV2Model = require('../../models/staff/designation');
const PayrollRunV2Model = require('../../models/payroll/payroll-run');
const StaffSalaryAssignmentV2Model = require('../../models/payroll/staff-salary-assignment');
const LeaveRequestV2Model = require('../../models/leave/leave-request');

// Live cascade counts (errors.md shape 6). Always read from the database, never from a cached
// list (staff/optimization.md) — each is ONE grouped query for the whole page of rows.

const LIVE = { status: { $ne: 'terminated' } };

const countBy = async (Model, match, field) => {
    const rows = await Model.aggregate([
        { $match: match },
        { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [String(row._id), row.count]));
};

/** departmentId → { staff, designations } */
const departmentCountsV2 = async (adminId, ids) => {
    const list = ids.map(String);
    const [staff, designations] = await Promise.all([
        countBy(StaffV2Model, { adminId, departmentId: { $in: list }, ...LIVE }, 'departmentId'),
        countBy(DesignationV2Model, { adminId, departmentId: { $in: list } }, 'departmentId'),
    ]);
    return new Map(list.map((id) => [id, { staff: staff.get(id) || 0, designations: designations.get(id) || 0 }]));
};

/** designationId → staff count */
const designationCountsV2 = (adminId, ids) =>
    countBy(StaffV2Model, { adminId, designationId: { $in: ids.map(String) }, ...LIVE }, 'designationId');

/** The records that keep one staff member from being removed. */
const staffCountsV2 = async (adminId, staffId) => {
    const id = String(staffId);
    const ref = { adminId, personType: 'staff', personId: id };
    // v2 data only (Rule 23.7): payroll runs + salary assignment key on staffId; the device link
    // is the card on the v2 Staff row itself (the WDMS emp code IS the staff _id).
    const [payroll, salaryStructure, leave, biometric] = await Promise.all([
        PayrollRunV2Model.countDocuments({ adminId, staffId: id }),
        StaffSalaryAssignmentV2Model.countDocuments({ adminId, staffId: id }),
        LeaveRequestV2Model.countDocuments(ref),
        StaffV2Model.countDocuments({ _id: id, adminId, cardNumber: { $type: 'string' } }),
    ]);
    return { payroll, salaryStructure, leave, biometric };
};

module.exports = { departmentCountsV2, designationCountsV2, staffCountsV2 };
