'use strict';
const StaffV2Model = require('../../models/staff/staff');
const DesignationV2Model = require('../../models/staff/designation');
const PayrollModel = require('../../models/payroll');
const SalaryStructureModel = require('../../models/salary-structure');
const LeaveRequestModel = require('../../models/leave-request');
const BiometricMappingModel = require('../../models/biometric-mapping');

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
const departmentCounts = async (adminId, ids) => {
    const list = ids.map(String);
    const [staff, designations] = await Promise.all([
        countBy(StaffV2Model, { adminId, departmentId: { $in: list }, ...LIVE }, 'departmentId'),
        countBy(DesignationV2Model, { adminId, departmentId: { $in: list } }, 'departmentId'),
    ]);
    return new Map(list.map((id) => [id, { staff: staff.get(id) || 0, designations: designations.get(id) || 0 }]));
};

/** designationId → staff count */
const designationCounts = (adminId, ids) =>
    countBy(StaffV2Model, { adminId, designationId: { $in: ids.map(String) }, ...LIVE }, 'designationId');

/** The records that keep one staff member from being removed. */
const staffCounts = async (adminId, staffId) => {
    const ref = { adminId, personType: 'staff', personId: String(staffId) };
    const [payroll, salaryStructure, leave, biometric] = await Promise.all([
        PayrollModel.countDocuments(ref),
        SalaryStructureModel.countDocuments(ref),
        LeaveRequestModel.countDocuments(ref),
        BiometricMappingModel.countDocuments(ref),
    ]);
    return { payroll, salaryStructure, leave, biometric };
};

module.exports = { departmentCounts, designationCounts, staffCounts };
