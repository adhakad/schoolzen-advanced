'use strict';
const AttendanceRuleModel = require('../models/attendance-rule');

let GetSingleAttendanceRule = async (req, res, next) => {
    try {
        const adminId = req.params.id;
        const attendanceRule = await AttendanceRuleModel.findOne({ adminId: adminId });
        if (attendanceRule) {
            return res.status(200).json(attendanceRule);
        } else {
            return res.status(404).json('Attendance rule not found!');
        }
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let CreateAttendanceRule = async (req, res, next) => {
    const { adminId, workStart, lateAfter, halfDayAfter, allowOvertime } = req.body;
    try {
        const checkAttendanceRule = await AttendanceRuleModel.findOne({ adminId: adminId });
        if (checkAttendanceRule) {
            return res.status(400).json('Attendance rule already exists for this school!');
        }
        const attendanceRuleData = {
            adminId: adminId,
            workStart: workStart,
            lateAfter: lateAfter,
            halfDayAfter: halfDayAfter,
            allowOvertime: allowOvertime,
        }
        const createAttendanceRule = await AttendanceRuleModel.create(attendanceRuleData);
        return res.status(200).json('Attendance rule created successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let UpdateAttendanceRule = async (req, res, next) => {
    try {
        const id = req.params.id;
        const attendanceRuleData = {
            workStart: req.body.workStart,
            lateAfter: req.body.lateAfter,
            halfDayAfter: req.body.halfDayAfter,
            allowOvertime: req.body.allowOvertime,
        }
        const update = await AttendanceRuleModel.findByIdAndUpdate(id, { $set: attendanceRuleData }, { new: true });
        return res.status(200).json('Attendance rule updated successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    GetSingleAttendanceRule,
    CreateAttendanceRule,
    UpdateAttendanceRule,
}
