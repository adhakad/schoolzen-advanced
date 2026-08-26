'use strict';
const HolidayModel = require('../models/holiday');
const HolidayTemplateModel = require('../models/holiday-template');
const { toUtcMidnight, toDateKey } = require('../helpers/date-only');
const logger = require('../helpers/logger');

// The school's declared holidays. A holiday is a RANGE — Diwali is three days, Independence
// Day is one — so every read hands the frontend a daysCount alongside the two dates rather
// than making the browser recompute it per row.
//
// Dates go in and out through helpers/date-only.js only. `new Date("2026-10-26")` is parsed
// as UTC by Node while `new Date("2026-10-26 00:00")` is parsed as LOCAL, and mixing the two
// is exactly how a holiday lands a day out for half the year.

// Inclusive day span. Both ends are UTC midnight, so this is exact integer arithmetic with
// no DST exposure — the same reason models/daily-attendance.js stores UTC midnights rather
// than instants.
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const daysBetween = (startDate, endDate) => (
    Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1
);

// One shape for every read, so the table, the template checklist and the assign preview all
// render off the same fields.
const toRow = (holiday) => ({
    _id: holiday._id,
    adminId: holiday.adminId,
    name: holiday.name,
    startDate: holiday.startDate,
    endDate: holiday.endDate,
    startDateKey: toDateKey(holiday.startDate),
    endDateKey: toDateKey(holiday.endDate),
    daysCount: daysBetween(holiday.startDate, holiday.endDate),
    createdAt: holiday.createdAt,
});

// INTERNAL — parse and sanity-check the two date keys a create/update sends.
// Returns { startDate, endDate } or { errorMsg }.
const parseRange = (startDateKey, endDateKey) => {
    const startDate = toUtcMidnight(startDateKey);
    const endDate = toUtcMidnight(endDateKey);
    if (!startDate || !endDate) return { errorMsg: 'A valid start and end date are required!' };
    if (endDate < startDate) return { errorMsg: 'The last day cannot be before the first day!' };
    return { startDate, endDate };
};

let countHoliday = async (req, res, next) => {
    try {
        const adminId = req.params.adminId;
        let countHoliday = await HolidayModel.count({ adminId: adminId });
        return res.status(200).json({ countHoliday });
    } catch (error) {
        logger.error('holiday.countHoliday', error);
        return res.status(500).json('Internal Server Error!');
    }
}

let GetHolidayPagination = async (req, res, next) => {
    let searchText = req.body.filters ? req.body.filters.searchText : '';
    const adminId = req.body.adminId;
    let searchObj = {};
    if (searchText) {
        searchObj = { name: new RegExp(`${searchText.toString().trim()}`, 'i') };
    }

    try {
        let limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
        let page = req.body.page || 1;
        // Sorted by the date the holiday falls on, not by _id: a calendar read top to bottom
        // should run in date order, and a holiday added late in the year belongs where its
        // date puts it rather than at the top of the list.
        const holidayList = await HolidayModel.find({ adminId: adminId }).find(searchObj)
            .sort({ startDate: 1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();
        const countHoliday = await HolidayModel.count({ adminId: adminId });

        let holidayData = { countHoliday: 0 };
        holidayData.holidayList = holidayList.map(toRow);
        holidayData.countHoliday = countHoliday;
        return res.json(holidayData);
    } catch (error) {
        logger.error('holiday.GetHolidayPagination', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// The unpaginated list the template checklist reads — a school declares a couple of dozen
// holidays a year, so there is nothing here worth paging.
let GetAllHoliday = async (req, res, next) => {
    const adminId = req.params.id;
    try {
        const holidayList = await HolidayModel.find({ adminId: adminId }).sort({ startDate: 1 }).lean();
        return res.status(200).json(holidayList.map(toRow));
    } catch (error) {
        logger.error('holiday.GetAllHoliday', error);
        return res.status(500).json('Internal Server Error!');
    }
}

let GetSingleHoliday = async (req, res, next) => {
    try {
        const singleHoliday = await HolidayModel.findOne({ _id: req.params.id }).lean();
        if (!singleHoliday) return res.status(404).json('Holiday not found!');
        return res.status(200).json(toRow(singleHoliday));
    } catch (error) {
        logger.error('holiday.GetSingleHoliday', error);
        return res.status(500).json('Internal Server Error!');
    }
}

let CreateHoliday = async (req, res, next) => {
    const { adminId, name, startDate, endDate } = req.body;
    try {
        if (!name) {
            return res.status(400).json('Holiday name is required!');
        }
        const range = parseRange(startDate, endDate);
        if (range.errorMsg) return res.status(400).json(range.errorMsg);

        // Case-insensitive and scoped to the same start date: a school may well declare
        // "Exam Break" twice in a year at different times, but declaring it twice on the
        // same day is a double-submit, not a policy.
        const checkHoliday = await HolidayModel.findOne({
            adminId: adminId,
            name: new RegExp(`^${name.toString().trim()}$`, 'i'),
            startDate: range.startDate,
        });
        if (checkHoliday) {
            return res.status(400).json('This holiday is already declared for that date!');
        }

        const holidayData = {
            adminId: adminId,
            name: name,
            startDate: range.startDate,
            endDate: range.endDate,
        }
        await HolidayModel.create(holidayData);
        return res.status(200).json('Holiday created successfully.');
    } catch (error) {
        logger.error('holiday.CreateHoliday', error);
        return res.status(500).json('Internal Server Error!');
    }
}

let UpdateHoliday = async (req, res, next) => {
    try {
        const id = req.params.id;
        const { adminId, name, startDate, endDate } = req.body;
        if (!name) {
            return res.status(400).json('Holiday name is required!');
        }
        const range = parseRange(startDate, endDate);
        if (range.errorMsg) return res.status(400).json(range.errorMsg);

        const checkHoliday = await HolidayModel.findOne({
            adminId: adminId,
            name: new RegExp(`^${name.toString().trim()}$`, 'i'),
            startDate: range.startDate,
            _id: { $ne: id },
        });
        if (checkHoliday) {
            return res.status(400).json('This holiday is already declared for that date!');
        }

        const holidayData = {
            name: name,
            startDate: range.startDate,
            endDate: range.endDate,
        }
        // Nothing to cascade: templates reference this holiday by id and the id is not
        // changing. Every assigned person picks the new dates up on the next lookup, which
        // is the point of services/holiday-lookup.js reading live data with no cache.
        const update = await HolidayModel.findByIdAndUpdate(id, { $set: holidayData }, { new: true });
        if (!update) return res.status(404).json('Holiday not found!');
        return res.status(200).json('Holiday updated successfully.');
    } catch (error) {
        logger.error('holiday.UpdateHoliday', error);
        return res.status(500).json('Internal Server Error!');
    }
}

let DeleteHoliday = async (req, res, next) => {
    try {
        const id = req.params.id;
        const holiday = await HolidayModel.findOne({ _id: id }).lean();
        if (!holiday) return res.status(404).json('Holiday not found!');

        // A template pointing at a deleted holiday would silently shorten every assigned
        // person's calendar with nothing on screen to explain it. $pull runs first, so a
        // failure between the two leaves a live holiday that is merely un-templated —
        // recoverable — rather than a template carrying a dangling id. Not blocked the way
        // DeleteLeaveType is: removing a holiday from the year is a normal edit, not a
        // retirement, and no other collection records that this holiday was ever observed.
        await HolidayTemplateModel.updateMany(
            { adminId: holiday.adminId, holidayIds: id },
            { $pull: { holidayIds: id } },
        );
        await HolidayModel.findByIdAndRemove(id);
        return res.status(200).json('Holiday deleted successfully.');
    } catch (error) {
        logger.error('holiday.DeleteHoliday', error);
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    countHoliday,
    GetHolidayPagination,
    GetAllHoliday,
    GetSingleHoliday,
    CreateHoliday,
    UpdateHoliday,
    DeleteHoliday,
}
