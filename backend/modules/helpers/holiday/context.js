'use strict';
const HolidayV2Model = require('../../models/holiday/holiday');
const HolidayTemplateV2Model = require('../../models/holiday/holiday-template');
const { ConflictError, NotFoundError } = require('../../errors');
const messages = require('../messages/holiday.messages');
const { findSessionId, getActiveSession } = require('../academic-session/session-resolver');
const { COLLATION } = require('../staff/lookups');
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');
const { ensureDefaultTemplate } = require('../../services/holiday/holiday-calendar');
const { holidayDays } = require('./holiday-rules');

// Shared pieces of the three Holiday controllers: the cached Holiday and Template lists,
// session resolution, and the module's error builders.
const MODULE = 'holiday';

const actorOf = (req) => String((req.user && (req.user.staffId || req.user.id)) || req.staffId || 'admin');

/** The header's session label → its id, else the active session, else null (staff-only pages still work). */
const findSession = async (adminId, label) => {
    if (label) {
        const id = await findSessionId(adminId, label);
        if (id) return String(id);
    }
    const active = await getActiveSession(adminId);
    return active ? String(active._id) : null;
};

const notFound = (id) => new NotFoundError(messages.notFound(), { module: MODULE, context: { id } });

const isDuplicateKey = (error) => Boolean(error) && (error.code === 11000 || /E11000/.test(String(error.message || '')));
const conflictOn = (field, code, message) => new ConflictError(message, { module: MODULE, code, fields: [{ field, message, code }] });

const toHolidayRow = (row) => ({
    _id: String(row._id),
    name: row.name,
    startDate: row.startDateKey,
    endDate: row.endDateKey,
    days: holidayDays(row.startDateKey, row.endDateKey),
    source: row.source,
});

/** Every holiday, by start date — `{adminId}:holiday:list`. */
const loadHolidays = (adminId) => cacheService.wrap(
    cacheKeys.holiday.list(adminId),
    cacheService.TTL.NEAR_STATIC_45,
    async () => (await HolidayV2Model.find({ adminId }).sort({ startDateKey: 1, name: 1 }).collation(COLLATION).lean()).map(toHolidayRow)
);

const toTemplateRow = (row) => ({
    _id: String(row._id),
    name: row.name,
    holidayIds: (row.holidayIds || []).map(String),
    weeklyOffDays: row.weeklyOffDays || [],
    isDefault: Boolean(row.isDefault),
    createdAt: row.createdAt,
});

/** Every template, Default first — `{adminId}:holiday:templates`. Seeds the Default. */
const loadTemplates = async (adminId) => {
    await ensureDefaultTemplate(adminId);
    return cacheService.wrap(
        cacheKeys.holiday.templates(adminId),
        cacheService.TTL.NEAR_STATIC_45,
        async () => (await HolidayTemplateV2Model.find({ adminId }).sort({ isDefault: -1, name: 1 }).collation(COLLATION).lean()).map(toTemplateRow)
    );
};

const invalidateHolidays = (adminId) => Promise.all([
    cacheService.delPattern(cacheKeys.holiday.listPattern(adminId)),
    // Calendars embed holiday ranges, so a holiday edit is also a template edit.
    cacheService.delPattern(cacheKeys.holiday.templatesPattern(adminId)),
]);
const invalidateTemplates = (adminId) => cacheService.delPattern(cacheKeys.holiday.templatesPattern(adminId));

module.exports = {
    MODULE,
    actorOf,
    findSession,
    notFound,
    isDuplicateKey,
    conflictOn,
    toHolidayRow,
    loadHolidays,
    toTemplateRow,
    loadTemplates,
    invalidateHolidays,
    invalidateTemplates,
};
