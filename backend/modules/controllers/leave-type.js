'use strict';
const LeaveTypeModel = require('../models/leave-type');
const LeaveRequestModel = require('../models/leave-request');

let countLeaveType = async (req, res, next) => {
    try {
        const adminId = req.params.adminId;
        let countLeaveType = await LeaveTypeModel.count({ adminId: adminId });
        return res.status(200).json({ countLeaveType });
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetLeaveTypePagination = async (req, res, next) => {
    let searchText = req.body.filters.searchText;
    const adminId = req.body.adminId;
    let searchObj = {};
    if (searchText) {
        searchObj = { name: new RegExp(`${searchText.toString().trim()}`, 'i') };
    }

    try {
        let limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
        let page = req.body.page || 1;
        const leaveTypeList = await LeaveTypeModel.find({ adminId: adminId }).find(searchObj).sort({ _id: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
        const countLeaveType = await LeaveTypeModel.count({ adminId: adminId });

        let leaveTypeData = { countLeaveType: 0 };
        leaveTypeData.leaveTypeList = leaveTypeList;
        leaveTypeData.countLeaveType = countLeaveType;
        return res.json(leaveTypeData);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetAllLeaveType = async (req, res, next) => {
    const adminId = req.params.id;
    try {
        const leaveTypeList = await LeaveTypeModel.find({ adminId: adminId });
        return res.status(200).json(leaveTypeList);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// GET /applicable/:adminId/:personType
// What the apply form's dropdown reads: only ACTIVE types, and only those this kind of
// person may actually take. An inactive type stays visible on the settings page (so its
// history still reads) but must never be offered on a new request.
// ---------------------------------------------------------------------------
let GetApplicableLeaveType = async (req, res, next) => {
    const { adminId, personType } = req.params;
    try {
        if (!['student', 'teacher', 'staff'].includes(personType)) {
            return res.status(400).json('A valid person type is required!');
        }
        const leaveTypeList = await LeaveTypeModel.find({
            adminId: adminId,
            status: 'active',
            applicableTo: { $in: ['all', personType] },
        }).sort({ name: 1 });
        return res.status(200).json(leaveTypeList);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetSingleLeaveType = async (req, res, next) => {
    try {
        const singleLeaveType = await LeaveTypeModel.findOne({ _id: req.params.id });
        return res.status(200).json(singleLeaveType);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let CreateLeaveType = async (req, res, next) => {
    const { adminId, name, isPaid, maxDaysPerYear, applicableTo, status } = req.body;
    try {
        if (!name) {
            return res.status(400).json('Leave type name is required!');
        }
        // Case-insensitive: "Sick Leave" and "sick leave" are the same policy to a school
        // office, and two of them would make the balance strip ambiguous.
        const checkLeaveType = await LeaveTypeModel.findOne({
            adminId: adminId,
            name: new RegExp(`^${name.toString().trim()}$`, 'i'),
        });
        if (checkLeaveType) {
            return res.status(400).json('Leave type already exist!');
        }

        const leaveTypeData = {
            adminId: adminId,
            name: name,
            isPaid: isPaid,
            maxDaysPerYear: maxDaysPerYear,
            applicableTo: applicableTo,
            status: status,
        }
        const createLeaveType = await LeaveTypeModel.create(leaveTypeData);
        return res.status(200).json('Leave type created successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let UpdateLeaveType = async (req, res, next) => {
    try {
        const id = req.params.id;
        const { adminId, name, isPaid, maxDaysPerYear, applicableTo, status } = req.body;
        if (!name) {
            return res.status(400).json('Leave type name is required!');
        }

        const checkLeaveType = await LeaveTypeModel.findOne({
            adminId: adminId,
            name: new RegExp(`^${name.toString().trim()}$`, 'i'),
            _id: { $ne: id },
        });
        if (checkLeaveType) {
            return res.status(400).json('Leave type already exist!');
        }

        // Narrowing applicableTo away from a type people are already on would leave those
        // requests pointing at a type they are no longer eligible for. Block it rather than
        // let the balance quietly stop matching the history.
        if (applicableTo && applicableTo !== 'all') {
            const conflicting = await LeaveRequestModel.findOne({
                leaveTypeId: id,
                personType: { $ne: applicableTo },
            });
            if (conflicting) {
                return res.status(400).json('This leave type is already used by another person type and cannot be narrowed!');
            }
        }

        const leaveTypeData = {
            name: name,
            isPaid: isPaid,
            maxDaysPerYear: maxDaysPerYear,
            applicableTo: applicableTo,
            status: status,
        }
        const update = await LeaveTypeModel.findByIdAndUpdate(id, { $set: leaveTypeData }, { new: true });
        return res.status(200).json('Leave type updated successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let DeleteLeaveType = async (req, res, next) => {
    // Referential guard, same shape as DeleteShift: a LeaveRequest pointing at a deleted
    // type would render as a blank column on the requests page and would make its share of
    // the balance unattributable. Deactivating the type is the correct way to retire it.
    try {
        const id = req.params.id;
        const checkLeaveRequest = await LeaveRequestModel.findOne({ leaveTypeId: id });
        if (checkLeaveRequest) {
            return res.status(400).json('This leave type is used in a leave request and cannot be deleted!');
        }
        const dlt = await LeaveTypeModel.findByIdAndRemove(id);
        return res.status(200).json('Leave type deleted successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    countLeaveType,
    GetLeaveTypePagination,
    GetAllLeaveType,
    GetApplicableLeaveType,
    GetSingleLeaveType,
    CreateLeaveType,
    UpdateLeaveType,
    DeleteLeaveType,
}
