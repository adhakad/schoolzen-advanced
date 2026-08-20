'use strict';
const ShiftModel = require('../models/shift');
const RosterModel = require('../models/roster');
const ClassShiftModel = require('../models/class-shift');

let countShift = async (req, res, next) => {
    try {
        const adminId = req.params.adminId;
        let countShift = await ShiftModel.count({ adminId: adminId });
        return res.status(200).json({ countShift });
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetShiftPagination = async (req, res, next) => {
    let searchText = req.body.filters.searchText;
    const adminId = req.body.adminId;
    let searchObj = {};
    if (searchText) {
        searchObj = { name: new RegExp(`${searchText.toString().trim()}`, 'i') };
    }

    try {
        let limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
        let page = req.body.page || 1;
        const shiftList = await ShiftModel.find({ adminId: adminId }).find(searchObj).sort({ _id: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
        const countShift = await ShiftModel.count({ adminId: adminId });

        let shiftData = { countShift: 0 };
        shiftData.shiftList = shiftList;
        shiftData.countShift = countShift;
        return res.json(shiftData);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetAllShift = async (req, res, next) => {
    const adminId = req.params.id;
    try {
        const shiftList = await ShiftModel.find({ adminId: adminId });
        return res.status(200).json(shiftList);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetSingleShift = async (req, res, next) => {
    try {
        const singleShift = await ShiftModel.findOne({ _id: req.params.id });
        return res.status(200).json(singleShift);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let CreateShift = async (req, res, next) => {
    const { adminId, name, startTime, endTime, earlyPunchMinutes, graceMinutes,
        halfDayAfterMinutes, earlyCheckoutMinutes, lateCheckoutMinutes, status } = req.body;
    try {
        const checkShift = await ShiftModel.findOne({ adminId: adminId, name: name });
        if (checkShift) {
            return res.status(400).json('Shift already exist!');
        }
        const shiftData = {
            adminId: adminId,
            name: name,
            startTime: startTime,
            endTime: endTime,
            earlyPunchMinutes: earlyPunchMinutes,
            graceMinutes: graceMinutes,
            halfDayAfterMinutes: halfDayAfterMinutes,
            earlyCheckoutMinutes: earlyCheckoutMinutes,
            lateCheckoutMinutes: lateCheckoutMinutes,
            status: status,
        }
        const createShift = await ShiftModel.create(shiftData);
        return res.status(200).json('Shift created successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let UpdateShift = async (req, res, next) => {
    try {
        const id = req.params.id;
        const checkShift = await ShiftModel.findOne({ adminId: req.body.adminId, name: req.body.name, _id: { $ne: id } });
        if (checkShift) {
            return res.status(400).json('Shift already exist!');
        }
        const shiftData = {
            name: req.body.name,
            startTime: req.body.startTime,
            endTime: req.body.endTime,
            earlyPunchMinutes: req.body.earlyPunchMinutes,
            graceMinutes: req.body.graceMinutes,
            halfDayAfterMinutes: req.body.halfDayAfterMinutes,
            earlyCheckoutMinutes: req.body.earlyCheckoutMinutes,
            lateCheckoutMinutes: req.body.lateCheckoutMinutes,
            status: req.body.status,
        }
        const update = await ShiftModel.findByIdAndUpdate(id, { $set: shiftData }, { new: true });
        return res.status(200).json('Shift updated successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let DeleteShift = async (req, res, next) => {
    // Referential guard, deliberately stricter than DeleteStaff/DeleteDesignation (which
    // leave dangling plain-String FKs): a roster row pointing at a deleted shift would make
    // the attendance reconciliation silently compute nothing for those people, so block it
    // cheaply here rather than debug it later.
    try {
        const id = req.params.id;
        const checkRoster = await RosterModel.findOne({ shiftId: id });
        if (checkRoster) {
            return res.status(400).json('This shift is assigned in the roster and cannot be deleted!');
        }
        // Same guard on the student side: a ClassShift pointing at a deleted shift would
        // leave that whole class with no resolvable baseline, so every student in it would
        // silently stop producing DailyAttendance rows.
        const checkClassShift = await ClassShiftModel.findOne({ shiftId: id });
        if (checkClassShift) {
            return res.status(400).json('This shift is assigned to a class and cannot be deleted!');
        }
        const dlt = await ShiftModel.findByIdAndRemove(id);
        return res.status(200).json('Shift deleted successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    countShift,
    GetShiftPagination,
    GetAllShift,
    GetSingleShift,
    CreateShift,
    UpdateShift,
    DeleteShift,
}
