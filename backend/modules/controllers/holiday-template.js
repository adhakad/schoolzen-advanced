'use strict';
const mongoose = require('mongoose');
const HolidayTemplateModel = require('../models/holiday-template');
const HolidayModel = require('../models/holiday');
const HolidayAssignmentModel = require('../models/holiday-assignment');
const ClassHolidayAssignmentModel = require('../models/class-holiday-assignment');
const SystemHolidayModel = require('../models/system-holiday');
const { toUtcMidnight } = require('../helpers/date-only');
const logger = require('../helpers/logger');

// Named bundles of holidays, plus the one action that creates a whole year at once:
// generating a template from the state-wise public holiday preset.
//
// Assignment always points at a template, never at a Holiday, so this is the layer that
// decides what a person's calendar contains. Nothing here writes DailyAttendance — the
// reconcile worker and the calendar reader resolve templates through
// services/holiday-lookup.js at read time.

// INTERNAL — how many people and classes each of these templates is assigned to.
// Two grouped aggregations for the whole page, never a count per row: the Templates tab
// renders ten templates and a count query each would be twenty round-trips for one screen.
const getAssignedCounts = async (adminId, templateIds) => {
    const countByTemplateId = new Map();
    if (templateIds.length === 0) return countByTemplateId;

    const [personGroups, classGroups] = await Promise.all([
        HolidayAssignmentModel.aggregate([
            { $match: { adminId: adminId, templateId: { $in: templateIds } } },
            { $group: { _id: '$templateId', total: { $sum: 1 } } },
        ]),
        ClassHolidayAssignmentModel.aggregate([
            { $match: { adminId: adminId, templateId: { $in: templateIds } } },
            { $group: { _id: '$templateId', total: { $sum: 1 } } },
        ]),
    ]);

    // Staff/teacher rows are people and class rows are classes. They are summed into one
    // "Assigned To" number on purpose — the admin is asking "is anybody still on this?",
    // which is also exactly the question the delete guard below asks.
    for (const group of [...personGroups, ...classGroups]) {
        const key = String(group._id);
        countByTemplateId.set(key, (countByTemplateId.get(key) || 0) + group.total);
    }
    return countByTemplateId;
};

let countHolidayTemplate = async (req, res, next) => {
    try {
        const adminId = req.params.adminId;
        let countHolidayTemplate = await HolidayTemplateModel.count({ adminId: adminId });
        return res.status(200).json({ countHolidayTemplate });
    } catch (error) {
        logger.error('holiday-template.countHolidayTemplate', error);
        return res.status(500).json('Internal Server Error!');
    }
}

let GetHolidayTemplatePagination = async (req, res, next) => {
    let searchText = req.body.filters ? req.body.filters.searchText : '';
    const adminId = req.body.adminId;
    let searchObj = {};
    if (searchText) {
        searchObj = { name: new RegExp(`${searchText.toString().trim()}`, 'i') };
    }

    try {
        let limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
        let page = req.body.page || 1;
        const templateList = await HolidayTemplateModel.find({ adminId: adminId }).find(searchObj)
            .sort({ _id: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();
        const countHolidayTemplate = await HolidayTemplateModel.count({ adminId: adminId });

        const assignedCounts = await getAssignedCounts(
            adminId,
            templateList.map((template) => template._id.toString()),
        );

        let templateData = { countHolidayTemplate: 0 };
        templateData.holidayTemplateList = templateList.map((template) => ({
            ...template,
            holidayCount: (template.holidayIds || []).length,
            assignedCount: assignedCounts.get(template._id.toString()) || 0,
        }));
        templateData.countHolidayTemplate = countHolidayTemplate;
        return res.json(templateData);
    } catch (error) {
        logger.error('holiday-template.GetHolidayTemplatePagination', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// The unpaginated list the Assign tab's template dropdown reads.
let GetAllHolidayTemplate = async (req, res, next) => {
    const adminId = req.params.id;
    try {
        const templateList = await HolidayTemplateModel.find({ adminId: adminId })
            .sort({ name: 1 })
            .lean();
        return res.status(200).json(templateList.map((template) => ({
            ...template,
            holidayCount: (template.holidayIds || []).length,
        })));
    } catch (error) {
        logger.error('holiday-template.GetAllHolidayTemplate', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// One template with its holidays resolved — the "holidays in this template" sub-list. Two
// queries, never one per holidayId.
let GetSingleHolidayTemplate = async (req, res, next) => {
    try {
        const template = await HolidayTemplateModel.findOne({ _id: req.params.id }).lean();
        if (!template) return res.status(404).json('Holiday template not found!');

        const holidays = (template.holidayIds || []).length > 0
            ? await HolidayModel.find({ _id: { $in: template.holidayIds } }).sort({ startDate: 1 }).lean()
            : [];

        return res.status(200).json({ ...template, holidays });
    } catch (error) {
        logger.error('holiday-template.GetSingleHolidayTemplate', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// INTERNAL — every id in the list must be a Holiday belonging to THIS school. Without this a
// template could be pointed at another school's holidays and the lookup would happily serve
// them, since it resolves by id and never re-checks the tenant.
const rejectForeignHolidayIds = async (adminId, holidayIds) => {
    const unique = [...new Set((holidayIds || []).map(String))];
    if (unique.length === 0) return { holidayIds: [] };
    const owned = await HolidayModel.find(
        { _id: { $in: unique }, adminId: adminId },
        { _id: 1 },
    ).lean();
    if (owned.length !== unique.length) {
        return { errorMsg: 'One or more holidays were not found!' };
    }
    return { holidayIds: unique };
};

let CreateHolidayTemplate = async (req, res, next) => {
    const { adminId, name, holidayIds } = req.body;
    try {
        if (!name) {
            return res.status(400).json('Template name is required!');
        }
        const checkTemplate = await HolidayTemplateModel.findOne({
            adminId: adminId,
            name: new RegExp(`^${name.toString().trim()}$`, 'i'),
        });
        if (checkTemplate) {
            return res.status(400).json('Holiday template already exist!');
        }

        const checked = await rejectForeignHolidayIds(adminId, holidayIds);
        if (checked.errorMsg) return res.status(404).json(checked.errorMsg);

        await HolidayTemplateModel.create({
            adminId: adminId,
            name: name,
            holidayIds: checked.holidayIds,
        });
        return res.status(200).json('Holiday template created successfully.');
    } catch (error) {
        logger.error('holiday-template.CreateHolidayTemplate', error);
        return res.status(500).json('Internal Server Error!');
    }
}

let UpdateHolidayTemplate = async (req, res, next) => {
    try {
        const id = req.params.id;
        const { adminId, name, holidayIds } = req.body;
        if (!name) {
            return res.status(400).json('Template name is required!');
        }
        const checkTemplate = await HolidayTemplateModel.findOne({
            adminId: adminId,
            name: new RegExp(`^${name.toString().trim()}$`, 'i'),
            _id: { $ne: id },
        });
        if (checkTemplate) {
            return res.status(400).json('Holiday template already exist!');
        }

        const checked = await rejectForeignHolidayIds(adminId, holidayIds);
        if (checked.errorMsg) return res.status(404).json(checked.errorMsg);

        // Editing a template that people are already on is allowed and is the normal way a
        // school adds a holiday mid-year — everyone assigned picks it up on the next lookup.
        const update = await HolidayTemplateModel.findByIdAndUpdate(
            id,
            { $set: { name: name, holidayIds: checked.holidayIds } },
            { new: true },
        );
        if (!update) return res.status(404).json('Holiday template not found!');
        return res.status(200).json('Holiday template updated successfully.');
    } catch (error) {
        logger.error('holiday-template.UpdateHolidayTemplate', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// PUT /:id/add-holiday — $addToSet, so re-adding the same holiday is a no-op rather than a
// duplicate id the lookup would then expand twice.
let AddHolidayToTemplate = async (req, res, next) => {
    try {
        const id = req.params.id;
        const { holidayId } = req.body;

        const template = await HolidayTemplateModel.findOne({ _id: id }).lean();
        if (!template) return res.status(404).json('Holiday template not found!');

        const holiday = await HolidayModel.findOne({ _id: holidayId, adminId: template.adminId }).lean();
        if (!holiday) return res.status(404).json('Holiday not found!');

        await HolidayTemplateModel.findByIdAndUpdate(id, { $addToSet: { holidayIds: String(holidayId) } });
        return res.status(200).json('Holiday added to the template.');
    } catch (error) {
        logger.error('holiday-template.AddHolidayToTemplate', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// PUT /:id/remove-holiday — takes the holiday out of THIS template only. The Holiday document
// itself survives and stays available to every other template.
let RemoveHolidayFromTemplate = async (req, res, next) => {
    try {
        const id = req.params.id;
        const { holidayId } = req.body;

        const update = await HolidayTemplateModel.findByIdAndUpdate(
            id,
            { $pull: { holidayIds: String(holidayId) } },
            { new: true },
        );
        if (!update) return res.status(404).json('Holiday template not found!');
        return res.status(200).json('Holiday removed from the template.');
    } catch (error) {
        logger.error('holiday-template.RemoveHolidayFromTemplate', error);
        return res.status(500).json('Internal Server Error!');
    }
}

let DeleteHolidayTemplate = async (req, res, next) => {
    try {
        const id = req.params.id;
        const template = await HolidayTemplateModel.findOne({ _id: id }).lean();
        if (!template) return res.status(404).json('Holiday template not found!');

        // Referential guard, the same shape DeleteLeaveType and DeleteShift use. Deleting a
        // template people are still on would leave those assignment rows pointing at nothing,
        // and every one of those people would silently lose their whole holiday calendar with
        // no error anywhere to explain it.
        const assignedCounts = await getAssignedCounts(template.adminId, [id]);
        const assignedCount = assignedCounts.get(String(id)) || 0;
        if (assignedCount > 0) {
            return res.status(400).json(`${assignedCount} people or classes are still using this template. Change their template first!`);
        }

        // The holidays themselves are NOT deleted — they belong to the school, not to this
        // bundle, and may well sit in another template.
        await HolidayTemplateModel.findByIdAndRemove(id);
        return res.status(200).json('Holiday template deleted successfully.');
    } catch (error) {
        logger.error('holiday-template.DeleteHolidayTemplate', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// GET /public-states/:year
//
// Which states the preset actually has data for, feeding the state dropdown on the
// Templates tab. Returns [] rather than an error when nothing has been inserted yet: an
// empty preset collection is the expected state of a fresh install, not a failure.
//
// The preset is hand-entered in Compass (see models/system-holiday.js), so this is a plain
// read of whatever is there — no seed, no external fetch, no redeploy to add a state.
// ---------------------------------------------------------------------------
let GetPublicHolidayStates = async (req, res, next) => {
    try {
        const year = Number(req.params.year);
        if (!year) return res.status(400).json('A valid year is required!');

        const presets = await SystemHolidayModel
            .find({ year: year }, { state: 1, year: 1, holidays: 1 })
            .sort({ state: 1 })
            .lean();

        // The count is what makes the dropdown honest — "MP (14 holidays)" tells the admin
        // whether that state has really been filled in or is an empty placeholder.
        return res.status(200).json(presets.map((preset) => ({
            state: preset.state,
            year: preset.year,
            holidayCount: (preset.holidays || []).length,
        })));
    } catch (error) {
        logger.error('holiday-template.GetPublicHolidayStates', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// POST /generate-from-public
// Body: { adminId, state, year, templateName }
//
// A ONE-TIME COPY, not a live link. Every preset entry becomes a normal, editable Holiday
// owned by this school, and those are bundled into a new template the admin names. After
// this returns, nothing references system-holiday: correcting a preset date next year can
// never retroactively change a school's calendar, and the admin has full CRUD on every
// holiday it produced.
//
// In a transaction, matching CreateBulkStudentRecord: a partial run would leave orphan
// Holiday documents in the school's list with no template pointing at them, which is
// indistinguishable from holidays the admin added on purpose and so cannot be cleaned up.
// ---------------------------------------------------------------------------
let GenerateTemplateFromPublic = async (req, res, next) => {
    const { adminId, state, year, templateName } = req.body;
    const session = await mongoose.startSession();
    try {
        const preset = await SystemHolidayModel.findOne({
            state: state.toString().trim().toUpperCase(),
            year: Number(year),
        }).lean();
        if (!preset || (preset.holidays || []).length === 0) {
            return res.status(404).json('No public holiday list has been set up for that state and year!');
        }

        const checkTemplate = await HolidayTemplateModel.findOne({
            adminId: adminId,
            name: new RegExp(`^${templateName.toString().trim()}$`, 'i'),
        });
        if (checkTemplate) {
            return res.status(400).json('Holiday template already exist!');
        }

        // Parsed BEFORE the transaction opens: a bad date in a hand-entered Compass document
        // should be reported as a specific message, not roll back a half-written template.
        // Each preset entry is a single day, so startDate === endDate — the admin can widen
        // any of them into a range afterwards like any other holiday.
        const holidayDocs = [];
        for (const entry of preset.holidays) {
            const date = toUtcMidnight(entry.date);
            if (!date) {
                return res.status(400).json(`The public holiday list has an unreadable date for ${entry.name}!`);
            }
            holidayDocs.push({
                adminId: adminId,
                name: entry.name,
                startDate: date,
                endDate: date,
                createdAt: new Date(),
            });
        }

        session.startTransaction();

        // ordered:true — if one insert fails the whole batch must fail, which is the point of
        // wrapping this at all.
        const createdHolidays = await HolidayModel.insertMany(holidayDocs, { session });
        const [createdTemplate] = await HolidayTemplateModel.create([{
            adminId: adminId,
            name: templateName,
            holidayIds: createdHolidays.map((holiday) => holiday._id.toString()),
        }], { session });

        await session.commitTransaction();

        logger.info('holiday-template.generatedFromPublic', {
            adminId,
            state: preset.state,
            year: preset.year,
            holidayCount: createdHolidays.length,
            templateId: createdTemplate._id.toString(),
        });
        return res.status(200).json(`${createdHolidays.length} holidays added and grouped into ${templateName}.`);
    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        logger.error('holiday-template.GenerateTemplateFromPublic', error);
        return res.status(500).json('Internal Server Error!');
    } finally {
        session.endSession();
    }
}

module.exports = {
    countHolidayTemplate,
    GetHolidayTemplatePagination,
    GetAllHolidayTemplate,
    GetSingleHolidayTemplate,
    CreateHolidayTemplate,
    UpdateHolidayTemplate,
    AddHolidayToTemplate,
    RemoveHolidayFromTemplate,
    DeleteHolidayTemplate,
    GetPublicHolidayStates,
    GenerateTemplateFromPublic,
}
