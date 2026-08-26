'use strict';
const SalaryGroupModel = require('../models/salary-group');
const SalaryStructureModel = require('../models/salary-structure');
const PayrollModel = require('../models/payroll');
const logger = require('../helpers/logger');

// The reusable pay scales a school configures once. See models/salary-group.js for why the
// allowance/deduction lists are flexible arrays and why nothing here is read at payroll time.

let countSalaryGroup = async (req, res, next) => {
    try {
        const adminId = req.params.adminId;
        let countSalaryGroup = await SalaryGroupModel.count({ adminId: adminId });
        return res.status(200).json({ countSalaryGroup });
    } catch (error) {
        logger.error('salary-group.countSalaryGroup', error);
        return res.status(500).json('Internal Server Error!');
    }
}

let GetSalaryGroupPagination = async (req, res, next) => {
    let searchText = req.body.filters ? req.body.filters.searchText : '';
    const adminId = req.body.adminId;
    let searchObj = {};
    if (searchText) {
        searchObj = { name: new RegExp(`${searchText.toString().trim()}`, 'i') };
    }

    try {
        let limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
        let page = req.body.page || 1;
        const salaryGroupList = await SalaryGroupModel.find({ adminId: adminId }).find(searchObj).sort({ _id: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
        const countSalaryGroup = await SalaryGroupModel.count({ adminId: adminId });

        let salaryGroupData = { countSalaryGroup: 0 };
        salaryGroupData.salaryGroupList = salaryGroupList;
        salaryGroupData.countSalaryGroup = countSalaryGroup;
        return res.json(salaryGroupData);
    } catch (error) {
        logger.error('salary-group.GetSalaryGroupPagination', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// Everything, including inactive groups — the settings table shows those so their history
// still reads. The assign picker uses GetActiveSalaryGroup below instead.
let GetAllSalaryGroup = async (req, res, next) => {
    const adminId = req.params.id;
    try {
        const salaryGroupList = await SalaryGroupModel.find({ adminId: adminId }).sort({ name: 1 });
        return res.status(200).json(salaryGroupList);
    } catch (error) {
        logger.error('salary-group.GetAllSalaryGroup', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// GET /active-salary-group/:adminId
// What the Assign Salary picker reads. An inactive group is a scale the school has retired:
// it stays on the settings table and on every Payroll that already snapshotted it, but must
// never be offered for a new assignment. Same split as leave-type GetApplicableLeaveType.
// ---------------------------------------------------------------------------
let GetActiveSalaryGroup = async (req, res, next) => {
    const adminId = req.params.adminId;
    try {
        const salaryGroupList = await SalaryGroupModel
            .find({ adminId: adminId, status: 'active' })
            .sort({ name: 1 });
        return res.status(200).json(salaryGroupList);
    } catch (error) {
        logger.error('salary-group.GetActiveSalaryGroup', error);
        return res.status(500).json('Internal Server Error!');
    }
}

let GetSingleSalaryGroup = async (req, res, next) => {
    try {
        const singleSalaryGroup = await SalaryGroupModel.findOne({ _id: req.params.id });
        return res.status(200).json(singleSalaryGroup);
    } catch (error) {
        logger.error('salary-group.GetSingleSalaryGroup', error);
        return res.status(500).json('Internal Server Error!');
    }
}

let CreateSalaryGroup = async (req, res, next) => {
    const { adminId, name, basic, hra, allowances, deductions, calculationMode, status } = req.body;
    try {
        if (!name) {
            return res.status(400).json('Salary group name is required!');
        }
        // Case-insensitive: "Primary Teacher" and "primary teacher" are the same scale to a
        // school office, and two of them would make the assign dropdown ambiguous.
        const checkSalaryGroup = await SalaryGroupModel.findOne({
            adminId: adminId,
            name: new RegExp(`^${name.toString().trim()}$`, 'i'),
        });
        if (checkSalaryGroup) {
            return res.status(400).json('Salary group already exist!');
        }

        const salaryGroupData = {
            adminId: adminId,
            name: name,
            basic: basic,
            hra: hra,
            allowances: allowances || [],
            deductions: deductions || [],
            calculationMode: calculationMode,
            status: status,
        }
        await SalaryGroupModel.create(salaryGroupData);
        return res.status(200).json('Salary group created successfully.');
    } catch (error) {
        logger.error('salary-group.CreateSalaryGroup', error);
        return res.status(500).json('Internal Server Error!');
    }
}

let UpdateSalaryGroup = async (req, res, next) => {
    try {
        const id = req.params.id;
        const { adminId, name, basic, hra, allowances, deductions, calculationMode, status } = req.body;
        if (!name) {
            return res.status(400).json('Salary group name is required!');
        }

        const checkSalaryGroup = await SalaryGroupModel.findOne({
            adminId: adminId,
            name: new RegExp(`^${name.toString().trim()}$`, 'i'),
            _id: { $ne: id },
        });
        if (checkSalaryGroup) {
            return res.status(400).json('Salary group already exist!');
        }

        // EDITING A GROUP DOES NOT RE-OPEN PAYROLL. Every generated Payroll snapshotted its
        // own copy of these numbers (see models/payroll.js), so a raise applied here changes
        // what the NEXT generation produces and nothing that has already been produced. The
        // admin is told, because "I changed the scale, why is last month unchanged" is the
        // obvious next question.
        const salaryGroupData = {
            name: name,
            basic: basic,
            hra: hra,
            allowances: allowances || [],
            deductions: deductions || [],
            calculationMode: calculationMode,
            status: status,
        }
        await SalaryGroupModel.findByIdAndUpdate(id, { $set: salaryGroupData }, { new: true });
        return res.status(200).json('Salary group updated successfully.');
    } catch (error) {
        logger.error('salary-group.UpdateSalaryGroup', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// Referential guard, same shape as DeleteLeaveType. A SalaryStructure pointing at a deleted
// group would make payroll ungeneratable for that person with no visible cause, and a Payroll
// pointing at one would lose the trace of which scale produced it. Deactivating is the
// correct way to retire a group.
let DeleteSalaryGroup = async (req, res, next) => {
    try {
        const id = req.params.id;

        const [assigned, used] = await Promise.all([
            SalaryStructureModel.findOne({ salaryGroupId: id }),
            PayrollModel.findOne({ salaryGroupId: id }),
        ]);
        if (assigned) {
            return res.status(400).json('This salary group is assigned to staff and cannot be deleted!');
        }
        if (used) {
            return res.status(400).json('This salary group has generated payroll and cannot be deleted!');
        }

        await SalaryGroupModel.findByIdAndRemove(id);
        return res.status(200).json('Salary group deleted successfully.');
    } catch (error) {
        logger.error('salary-group.DeleteSalaryGroup', error);
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    countSalaryGroup,
    GetSalaryGroupPagination,
    GetAllSalaryGroup,
    GetActiveSalaryGroup,
    GetSingleSalaryGroup,
    CreateSalaryGroup,
    UpdateSalaryGroup,
    DeleteSalaryGroup,
}
