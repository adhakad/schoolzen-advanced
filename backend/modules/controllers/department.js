'use strict';
const DepartmentModel = require('../models/department');

let countDepartment = async (req, res, next) => {
    try {
        const adminId = req.params.adminId;
        let countDepartment = await DepartmentModel.count({ adminId: adminId });
        return res.status(200).json({ countDepartment });
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetDepartmentPagination = async (req, res, next) => {
    let searchText = req.body.filters.searchText;
    const adminId = req.body.adminId;
    let searchObj = {};
    if (searchText) {
        searchObj = { name: new RegExp(`${searchText.toString().trim()}`, 'i') };
    }

    try {
        let limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
        let page = req.body.page || 1;
        const departmentList = await DepartmentModel.find({ adminId: adminId }).find(searchObj).sort({ _id: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
        const countDepartment = await DepartmentModel.count({ adminId: adminId });

        let departmentData = { countDepartment: 0 };
        departmentData.departmentList = departmentList;
        departmentData.countDepartment = countDepartment;
        return res.json(departmentData);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetAllDepartment = async (req, res, next) => {
    const adminId = req.params.id;
    try {
        const departmentList = await DepartmentModel.find({ adminId: adminId });
        return res.status(200).json(departmentList);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetSingleDepartment = async (req, res, next) => {
    try {
        const singleDepartment = await DepartmentModel.findOne({ _id: req.params.id });
        return res.status(200).json(singleDepartment);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let CreateDepartment = async (req, res, next) => {
    const { adminId, name, status } = req.body;
    try {
        const checkDepartment = await DepartmentModel.findOne({ adminId: adminId, name: name });
        if (checkDepartment) {
            return res.status(400).json('Department already exist!');
        }
        const departmentData = {
            adminId: adminId,
            name: name,
            status: status,
        }
        const createDepartment = await DepartmentModel.create(departmentData);
        return res.status(200).json('Department created successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let UpdateDepartment = async (req, res, next) => {
    try {
        const id = req.params.id;
        const departmentData = {
            name: req.body.name,
            status: req.body.status,
        }
        const update = await DepartmentModel.findByIdAndUpdate(id, { $set: departmentData }, { new: true });
        return res.status(200).json('Department updated successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let DeleteDepartment = async (req, res, next) => {
    // Note: Designations referencing this Department via departmentId (a plain String FK,
    // not a Mongoose ref) are not cascade-deleted or cleared here — matches how the rest of
    // the codebase handles plain-String FKs (no cascade support), so this is a known orphaned
    // FK risk, not solved in this phase.
    try {
        const id = req.params.id;
        const dlt = await DepartmentModel.findByIdAndRemove(id);
        return res.status(200).json('Department deleted successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    countDepartment,
    GetDepartmentPagination,
    GetAllDepartment,
    GetSingleDepartment,
    CreateDepartment,
    UpdateDepartment,
    DeleteDepartment,
}
