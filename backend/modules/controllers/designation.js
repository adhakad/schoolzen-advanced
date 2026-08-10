'use strict';
const DesignationModel = require('../models/designation');

let countDesignation = async (req, res, next) => {
    try {
        const adminId = req.params.adminId;
        let countDesignation = await DesignationModel.count({ adminId: adminId });
        return res.status(200).json({ countDesignation });
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetDesignationPagination = async (req, res, next) => {
    let searchText = req.body.filters.searchText;
    const adminId = req.body.adminId;
    let searchObj = {};
    if (searchText) {
        searchObj = { title: new RegExp(`${searchText.toString().trim()}`, 'i') };
    }

    try {
        let limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
        let page = req.body.page || 1;
        const designationList = await DesignationModel.find({ adminId: adminId }).find(searchObj).sort({ _id: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
        const countDesignation = await DesignationModel.count({ adminId: adminId });

        let designationData = { countDesignation: 0 };
        designationData.designationList = designationList;
        designationData.countDesignation = countDesignation;
        return res.json(designationData);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetAllDesignation = async (req, res, next) => {
    const adminId = req.params.id;
    try {
        const designationList = await DesignationModel.find({ adminId: adminId });
        return res.status(200).json(designationList);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetSingleDesignation = async (req, res, next) => {
    try {
        const singleDesignation = await DesignationModel.findOne({ _id: req.params.id });
        return res.status(200).json(singleDesignation);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let CreateDesignation = async (req, res, next) => {
    const { adminId, title, departmentId, status } = req.body;
    try {
        const checkDesignation = await DesignationModel.findOne({ adminId: adminId, title: title });
        if (checkDesignation) {
            return res.status(400).json('Designation already exist!');
        }
        const designationData = {
            adminId: adminId,
            title: title,
            departmentId: departmentId,
            status: status,
        }
        const createDesignation = await DesignationModel.create(designationData);
        return res.status(200).json('Designation created successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let UpdateDesignation = async (req, res, next) => {
    try {
        const id = req.params.id;
        const designationData = {
            title: req.body.title,
            departmentId: req.body.departmentId,
            status: req.body.status,
        }
        const update = await DesignationModel.findByIdAndUpdate(id, { $set: designationData }, { new: true });
        return res.status(200).json('Designation updated successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let DeleteDesignation = async (req, res, next) => {
    try {
        const id = req.params.id;
        const dlt = await DesignationModel.findByIdAndRemove(id);
        return res.status(200).json('Designation deleted successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    countDesignation,
    GetDesignationPagination,
    GetAllDesignation,
    GetSingleDesignation,
    CreateDesignation,
    UpdateDesignation,
    DeleteDesignation,
}
