'use strict';
const mongoose = require('mongoose');
const StaffV2Model = require('../../models/staff/staff');
const SalaryGroupV2Model = require('../../models/payroll/salary-group');
const { NotFoundError } = require('../../errors');
const messages = require('../messages/payroll.messages');
const { escapeRegExp } = require('../staff/lookups');
const { toDateKey } = require('../date-only');
const { nowWallClock } = require('../attendance-time');
const { allows } = require('../../middleware/require-permission');
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');

// Shared pieces of the four Payroll controllers: actor, today, the cached Salary Group list,
// the Department → Designation staff filter, and keyset paging over an id-sorted list.
const MODULE = 'payroll';
const MAX_PEOPLE = 2000;
const { ObjectId } = mongoose.Types;

// The explicit Roles & Permissions grants (models/settings/role.js).
const PERMISSIONS = Object.freeze({
    VIEW: 'payroll',
    ASSIGN: 'payroll-assign',
    GENERATE: 'payroll-generate',
    PAYOUT: 'payroll-payout',
});

const todayKey = () => toDateKey(nowWallClock());
const actorOf = (req) => String((req.user && (req.user.staffId || req.user.id)) || req.staffId || 'admin');
const actorNameOf = (req) => {
    const user = req.user || {};
    return (user.payload && user.payload.name) || user.name || 'Admin';
};

/** Whether the caller holds `module`'s edit grant — the page hides controls on false. */
const canEditOf = (req, module) => Boolean(req.permissions && allows(req.permissions, module, 'edit'));

const runNotFound = (id) => new NotFoundError(messages.runNotFound(), { module: MODULE, code: 'PAYROLL_NOT_FOUND', context: { id } });
const personNotFound = (id) => new NotFoundError(messages.personNotFound(), { module: MODULE, code: 'PERSON_NOT_FOUND', context: { id } });

const isObjectId = (value) => ObjectId.isValid(String(value || '')) && String(new ObjectId(String(value))) === String(value);

// ---- Salary Groups (the module's one near-static cached list) -----------------------------

const toGroupRow = (row) => ({
    _id: String(row._id),
    name: row.name,
    mode: row.mode,
    basic: row.basic,
    hra: row.hra,
    allowances: (row.allowances || []).map((c) => ({ name: c.name, amount: c.amount })),
    deductions: (row.deductions || []).map((c) => ({ name: c.name, amount: c.amount })),
    status: row.status,
});

/** Every salary group, sorted by name — `{adminId}:payroll:salary-groups`. */
const loadSalaryGroups = (adminId) => cacheService.wrap(
    cacheKeys.payroll.salaryGroups(adminId),
    cacheService.TTL.NEAR_STATIC_45,
    async () => {
        const rows = await SalaryGroupV2Model.find({ adminId }).sort({ name: 1 }).collation({ locale: 'en', strength: 2 }).lean();
        return rows.map(toGroupRow);
    }
);

const invalidateSalaryGroups = (adminId) => cacheService.delPattern(cacheKeys.payroll.salaryGroupsPattern(adminId));

/** Map<groupId, group> — read live (not cached) where money is about to be computed. */
const loadGroupsById = async (adminId, ids) => {
    const valid = [...new Set(ids.map(String))].filter(isObjectId);
    if (!valid.length) return new Map();
    const rows = await SalaryGroupV2Model.find({ adminId, _id: { $in: valid } }).lean();
    return new Map(rows.map((row) => [String(row._id), toGroupRow(row)]));
};

// ---- People -------------------------------------------------------------------------------

const toPersonRow = (row) => ({
    _id: String(row._id),
    name: row.name,
    code: row.empCode || null,
    department: row.department || null,
    designation: row.designation || null,
});

/** Active staff matching Department → Designation + search, by _id (keyset order). Capped. */
const findStaff = async (adminId, { departmentId, designationId, search } = {}) => {
    const filter = { adminId, status: 'active' };
    if (departmentId) filter.departmentId = departmentId;
    if (designationId) filter.designationId = designationId;
    if (search) {
        const pattern = new RegExp(escapeRegExp(String(search).trim()), 'i');
        filter.$or = [{ name: pattern }, { empCode: pattern }];
    }
    const rows = await StaffV2Model.find(filter, { name: 1, empCode: 1, department: 1, designation: 1 })
        .sort({ _id: 1 }).limit(MAX_PEOPLE + 1).lean();
    return { truncated: rows.length > MAX_PEOPLE, rows: rows.slice(0, MAX_PEOPLE).map(toPersonRow) };
};

/** Map<staffId, person> for specific ids, this school only (any status — history reads). */
const describeStaff = async (adminId, ids, activeOnly = false) => {
    const valid = [...new Set(ids.map(String))].filter(isObjectId);
    if (!valid.length) return new Map();
    const filter = { adminId, _id: { $in: valid } };
    if (activeOnly) filter.status = 'active';
    const rows = await StaffV2Model.find(filter, { name: 1, empCode: 1, department: 1, designation: 1, status: 1 }).lean();
    return new Map(rows.map((row) => [String(row._id), { ...toPersonRow(row), status: row.status }]));
};

/**
 * Keyset page over rows already sorted by `_id` ascending: rows after `after`, `limit` of
 * them, plus the cursor for the next page (null on the last).
 */
const keysetPage = (rows, after, limit) => {
    const start = after ? rows.findIndex((row) => String(row._id) > String(after)) : 0;
    const from = start < 0 ? rows.length : start;
    const page = rows.slice(from, from + limit);
    const more = from + limit < rows.length;
    return { rows: page, nextCursor: more && page.length ? String(page[page.length - 1]._id) : null };
};

const offsetPage = (rows, page, limit) => ({
    rows: rows.slice((page - 1) * limit, page * limit),
    total: rows.length,
    page,
    limit,
});

module.exports = {
    MODULE,
    MAX_PEOPLE,
    PERMISSIONS,
    todayKey,
    actorOf,
    actorNameOf,
    canEditOf,
    runNotFound,
    personNotFound,
    isObjectId,
    toGroupRow,
    loadSalaryGroups,
    invalidateSalaryGroups,
    loadGroupsById,
    findStaff,
    describeStaff,
    keysetPage,
    offsetPage,
};
