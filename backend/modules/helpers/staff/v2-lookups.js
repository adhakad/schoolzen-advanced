'use strict';
const DepartmentV2Model = require('../../models/staff/department');
const DesignationV2Model = require('../../models/staff/designation');
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');

// The two near-static lookup lists (staff/optimization.md): one cached copy per school, read
// by the Departments/Designations pages AND Manage Staff's dependent dropdown. A school has a
// handful of each, so search and paging run over the cached array instead of a new query.

const COLLATION = { locale: 'en', strength: 2 };

/** [{ _id, name, status }] sorted by name. */
const loadDepartments = (adminId) => cacheService.wrap(
    cacheKeys.staff.departments(adminId),
    cacheService.TTL.NEAR_STATIC_45,
    async () => {
        const rows = await DepartmentV2Model.find({ adminId }, 'name status').sort({ name: 1 }).collation(COLLATION).lean();
        return rows.map((row) => ({ _id: String(row._id), name: row.name, status: row.status }));
    }
);

/** [{ _id, title, departmentId, department, status }] sorted by title. */
const loadDesignations = (adminId) => cacheService.wrap(
    cacheKeys.staff.designations(adminId),
    cacheService.TTL.NEAR_STATIC_45,
    async () => {
        const [rows, departments] = await Promise.all([
            DesignationV2Model.find({ adminId }, 'title departmentId status').sort({ title: 1 }).collation(COLLATION).lean(),
            loadDepartments(adminId),
        ]);
        const names = new Map(departments.map((dept) => [dept._id, dept.name]));
        return rows.map((row) => ({
            _id: String(row._id),
            title: row.title,
            departmentId: row.departmentId || null,
            department: (row.departmentId && names.get(row.departmentId)) || null,
            status: row.status,
        }));
    }
);

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive "contains", with the typed text escaped (no ReDoS / invalid pattern). */
const matcher = (search) => {
    if (!search) return () => true;
    const pattern = new RegExp(escapeRegExp(search.trim()), 'i');
    return (text) => pattern.test(text || '');
};

const paginate = (rows, page, limit) => ({
    rows: rows.slice((page - 1) * limit, page * limit),
    total: rows.length,
    page,
    limit,
});

module.exports = { COLLATION, loadDepartments, loadDesignations, escapeRegExp, matcher, paginate };
