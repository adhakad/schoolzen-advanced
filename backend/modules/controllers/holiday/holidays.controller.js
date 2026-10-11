'use strict';
const HolidayV2Model = require('../../models/holiday/holiday');
const HolidayTemplateV2Model = require('../../models/holiday/holiday-template');
const SystemHolidayV2Model = require('../../models/holiday/system-holiday');
const { ValidationError, NotFoundError } = require('../../errors');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/holiday.messages');
const { withTransaction } = require('../../helpers/with-transaction');
const { matcher, paginate } = require('../../helpers/staff/lookups');
const {
    MODULE, actorOf, notFound, isDuplicateKey, conflictOn, toHolidayRow, loadHolidays, invalidateHolidays,
} = require('../../helpers/holiday/context');
const { MAX_HOLIDAY_DAYS, holidayDays, dedupePublic } = require('../../helpers/holiday/holiday-rules');
const { enqueueReconcileToday } = require('../../services/holiday/holiday-calendar');
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');
const { logActivity } = require('../../services/activity-log.service');

// Holidays (holiday/holidays.md) — the school's master list of dated holidays. Every
// single-record lookup is scoped by adminId (errors.md, "Critical — tenant isolation"):
// another school's id reads exactly like a missing one.
//
// Any write that can change a day already in a template re-runs today's attendance
// reconcile when it touches today (errors.md shape 9).
const ENTITY = 'Holiday';
const SYSTEM_TTL = 24 * 60 * 60;

const duplicate = () => conflictOn('name', 'HOLIDAY_DUPLICATE', messages.holidayDuplicate());
const rethrowDuplicate = (error) => { if (isDuplicateKey(error)) throw duplicate(); throw error; };

const assertRange = (startDate, endDate) => {
    const days = holidayDays(startDate, endDate);
    if (!days) {
        throw new ValidationError(messages.dateRangeInvalid(), {
            module: MODULE, code: 'HOLIDAY_DATE_RANGE_INVALID',
            fields: [{ field: 'endDate', message: messages.dateRangeInvalid(), code: 'HOLIDAY_DATE_RANGE_INVALID' }],
        });
    }
    if (days > MAX_HOLIDAY_DAYS) {
        throw new ValidationError(messages.rangeTooLong(MAX_HOLIDAY_DAYS), {
            module: MODULE, code: 'HOLIDAY_DATE_RANGE_INVALID',
            fields: [{ field: 'endDate', message: messages.rangeTooLong(MAX_HOLIDAY_DAYS), code: 'HOLIDAY_DATE_RANGE_INVALID' }],
        });
    }
};

const monthBounds = (month) => {
    const [year, mon] = month.split('-').map(Number);
    const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
};

let GetHolidays = async (req, res) => {
    const { adminId, search, month, page, limit } = req.query;
    const all = await loadHolidays(adminId);
    const matches = matcher(search);
    let rows = all.filter((row) => matches(row.name));
    if (month) {
        const { start, end } = monthBounds(month);
        rows = rows.filter((row) => row.startDate <= end && row.endDate >= start);
    }
    const result = paginate(rows, page, limit);
    result.summary = { total: all.length, auto: all.filter((row) => row.source === 'auto').length };
    return res.status(200).json(result);
};

/** Every holiday — the Templates modal's checklist. */
let GetHolidayOptions = async (req, res) => res.status(200).json({ rows: await loadHolidays(req.query.adminId) });

const fieldsOf = (body) => ({ name: body.name, startDateKey: body.startDate, endDateKey: body.endDate });

let CreateHoliday = async (req, res) => {
    const { adminId, startDate, endDate } = req.body;
    assertRange(startDate, endDate);
    const actor = actorOf(req);
    const created = await HolidayV2Model
        .create({ adminId, ...fieldsOf(req.body), source: 'manual', createdBy: actor, updatedBy: actor })
        .catch(rethrowDuplicate);
    await invalidateHolidays(adminId);
    await logActivity(req, { module: MODULE, action: 'holiday.create', targetId: String(created._id), meta: fieldsOf(req.body) });
    return res.status(200).json({ message: success.created(ENTITY), holiday: toHolidayRow(created) });
};

let UpdateHoliday = async (req, res) => {
    const { adminId, startDate, endDate } = req.body;
    assertRange(startDate, endDate);
    const holiday = await HolidayV2Model.findOne({ _id: req.params.id, adminId });
    if (!holiday) throw notFound(req.params.id);
    const before = { name: holiday.name, startDateKey: holiday.startDateKey, endDateKey: holiday.endDateKey };
    Object.assign(holiday, fieldsOf(req.body), { updatedBy: actorOf(req), updatedAt: new Date() });
    await holiday.save().catch(rethrowDuplicate);
    await invalidateHolidays(adminId);
    await enqueueReconcileToday(adminId, [before, holiday]);
    await logActivity(req, { module: MODULE, action: 'holiday.update', targetId: String(holiday._id), changes: { before, after: fieldsOf(req.body) } });
    return res.status(200).json({ message: success.updated(ENTITY), holiday: toHolidayRow(holiday) });
};

/**
 * Not blocked by templates (errors.md shape 6) — detached from every template holding it in
 * the same transaction, and the count is reported instead of a silent $pull.
 */
let DeleteHoliday = async (req, res) => {
    const { adminId } = req.query;
    const holiday = await HolidayV2Model.findOne({ _id: req.params.id, adminId }).lean();
    if (!holiday) throw notFound(req.params.id);

    const templatesTouched = await withTransaction(async (dbSession) => {
        const pulled = await HolidayTemplateV2Model.updateMany(
            { adminId, holidayIds: holiday._id },
            { $pull: { holidayIds: holiday._id }, $set: { updatedAt: new Date() } },
            { session: dbSession }
        );
        await HolidayV2Model.deleteOne({ _id: holiday._id, adminId }, { session: dbSession });
        return pulled.modifiedCount || 0;
    });

    await invalidateHolidays(adminId);
    await enqueueReconcileToday(adminId, [holiday]);
    await logActivity(req, {
        module: MODULE, action: 'holiday.delete', targetId: String(holiday._id),
        meta: { name: holiday.name, startDateKey: holiday.startDateKey, endDateKey: holiday.endDateKey, templatesTouched },
    });
    return res.status(200).json({ message: messages.holidayDeleted(templatesTouched), templatesTouched });
};

// ---- Generate from Public Holidays ------------------------------------------------------------

/** States (and their years) present in the Compass-maintained dataset. */
let GetSystemStates = async (req, res) => {
    const rows = await cacheService.wrap(cacheKeys.holiday.systemStates(), SYSTEM_TTL, async () => {
        const docs = await SystemHolidayV2Model.aggregate([
            { $group: { _id: '$state', years: { $addToSet: '$year' } } },
            { $sort: { _id: 1 } },
        ]);
        return docs.map((doc) => ({ state: doc._id, years: doc.years.sort((a, b) => b - a) }));
    });
    return res.status(200).json({ rows });
};

const loadSystemHolidays = (state, year) => cacheService.wrap(
    cacheKeys.holiday.system(state, year),
    SYSTEM_TTL,
    async () => {
        const doc = await SystemHolidayV2Model.findOne({ state, year }, 'holidays').lean();
        return doc ? doc.holidays.filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date)) : null;
    }
);

const systemDataMissing = (state, year) =>
    new NotFoundError(messages.systemDataMissing(), { module: MODULE, code: 'SYSTEM_HOLIDAY_DATA_MISSING', context: { state, year } });

/** The Generate modal's preview list + calendar: one state's official holidays for a year. */
let GetSystemHolidays = async (req, res) => {
    const { state, year } = req.query;
    const entries = await loadSystemHolidays(state, Number(year));
    if (!entries || !entries.length) throw systemDataMissing(state, year);
    return res.status(200).json({ rows: [...entries].sort((a, b) => a.date.localeCompare(b.date)) });
};

/**
 * One-time clone of a state's official holidays into this school's own rows (source 'auto'),
 * deduped per (name, start) against what already exists — re-running is a no-op. With
 * `selected`, only the ticked rows of the preview list are cloned.
 */
let GenerateFromPublic = async (req, res) => {
    const { adminId, state, year, selected } = req.body;
    const all = await loadSystemHolidays(state, year);
    if (!all || !all.length) throw systemDataMissing(state, year);
    const ticked = selected ? new Set(selected) : null;
    const entries = ticked ? all.filter((row) => ticked.has(`${row.name}|${row.date}`)) : all;
    const dates = [...new Set(entries.map((row) => row.date))];
    const existing = await HolidayV2Model.find({ adminId, startDateKey: { $in: dates } }, 'name startDateKey').lean();
    const { fresh, skipped } = dedupePublic(existing, entries);

    let inserted = 0;
    if (fresh.length) {
        const actor = actorOf(req);
        try {
            const docs = await HolidayV2Model.insertMany(
                fresh.map((row) => ({ adminId, ...row, source: 'auto', createdBy: actor, updatedBy: actor })),
                { ordered: false }
            );
            inserted = docs.length;
        } catch (error) {
            // A concurrent generate inserted some of the same rows — the unique index dropped them.
            if (!isDuplicateKey(error) && !(error.writeErrors || []).length) throw error;
            inserted = (error.insertedDocs || []).length || fresh.length - (error.writeErrors || []).length;
        }
    }
    const totalSkipped = skipped + (fresh.length - inserted);

    await invalidateHolidays(adminId);
    await logActivity(req, { module: MODULE, action: 'holiday.generate', meta: { state, year, inserted, skipped: totalSkipped } });
    return res.status(200).json({ message: messages.generated(inserted, totalSkipped), inserted, skipped: totalSkipped });
};

module.exports = {
    GetHolidays,
    GetHolidayOptions,
    CreateHoliday,
    UpdateHoliday,
    DeleteHoliday,
    GetSystemStates,
    GetSystemHolidays,
    GenerateFromPublic,
};
