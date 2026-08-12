'use strict';
const StaffModel = require('../models/staff');

let countStaff = async (req, res, next) => {
    try {
        const adminId = req.params.adminId;
        let countStaff = await StaffModel.count({ adminId: adminId });
        return res.status(200).json({ countStaff });
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetStaffPagination = async (req, res, next) => {
    let searchText = req.body.filters.searchText;
    const adminId = req.body.adminId;
    let searchObj = {};
    if (searchText) {
        searchObj = { name: new RegExp(`${searchText.toString().trim()}`, 'i') };
    }

    try {
        let limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
        let page = req.body.page || 1;
        const staffList = await StaffModel.find({ adminId: adminId }).find(searchObj).sort({ _id: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
        const countStaff = await StaffModel.count({ adminId: adminId });

        let staffData = { countStaff: 0 };
        staffData.staffList = staffList;
        staffData.countStaff = countStaff;
        return res.json(staffData);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetAllStaff = async (req, res, next) => {
    const adminId = req.params.id;
    try {
        const staffList = await StaffModel.find({ adminId: adminId });
        return res.status(200).json(staffList);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetSingleStaff = async (req, res, next) => {
    try {
        const singleStaff = await StaffModel.findOne({ _id: req.params.id });
        return res.status(200).json(singleStaff);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let CreateStaff = async (req, res, next) => {
    const { adminId, name, departmentId, designationId, joiningDate, status, empCode } = req.body;
    try {
        if (empCode) {
            const checkEmpCode = await StaffModel.findOne({ adminId: adminId, empCode: empCode });
            if (checkEmpCode) {
                return res.status(400).json('This employee code is already assigned to another staff member!');
            }
        }
        const staffData = {
            adminId: adminId,
            name: name,
            departmentId: departmentId,
            designationId: designationId,
            joiningDate: joiningDate,
            status: status,
            empCode: empCode,
        }
        const createStaff = await StaffModel.create(staffData);
        return res.status(200).json('Staff created successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let UpdateStaff = async (req, res, next) => {
    try {
        const id = req.params.id;
        if (req.body.empCode) {
            const checkEmpCode = await StaffModel.findOne({ adminId: req.body.adminId, empCode: req.body.empCode, _id: { $ne: id } });
            if (checkEmpCode) {
                return res.status(400).json('This employee code is already assigned to another staff member!');
            }
        }
        const staffData = {
            name: req.body.name,
            departmentId: req.body.departmentId,
            designationId: req.body.designationId,
            joiningDate: req.body.joiningDate,
            status: req.body.status,
            empCode: req.body.empCode,
        }
        const update = await StaffModel.findByIdAndUpdate(id, { $set: staffData }, { new: true });
        return res.status(200).json('Staff updated successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let DeleteStaff = async (req, res, next) => {
    // Note: BiometricMapping rows referencing this Staff via personId (a plain String FK,
    // not a Mongoose ref) are not cascade-deleted here — matches how Department/Designation
    // handle plain-String FK cleanup (not solved in this phase; same known limitation).
    try {
        const id = req.params.id;
        const dlt = await StaffModel.findByIdAndRemove(id);
        return res.status(200).json('Staff deleted successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    countStaff,
    GetStaffPagination,
    GetAllStaff,
    GetSingleStaff,
    CreateStaff,
    UpdateStaff,
    DeleteStaff,
}
