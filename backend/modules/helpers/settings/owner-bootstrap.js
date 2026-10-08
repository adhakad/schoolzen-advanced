'use strict';
const StaffV2Model = require('../../models/staff/staff');
const RoleModel = require('../../models/settings/role');
const RoleAssignmentModel = require('../../models/settings/role-assignment');
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');
const { isDuplicateKey } = require('./duplicate-key');

// The school's root identity in the v2 permission model (roles-permissions.md):
//   - the seeded roles (Super Admin + three defaults),
//   - the owner's Staff row (isOwner: true — exactly one per school),
//   - the owner's Super Admin RoleAssignment.
//
// "Set at school creation" — signup is legacy and untouched, so this runs lazily on the
// school's first v2 Settings request instead, and is idempotent + race-safe: every write is
// an upsert onto a unique index, so concurrent first requests converge on one copy.

const all = (canView, canEdit) => ({ canView, canEdit });
const perms = (map) => Object.entries(map).map(([module, p]) => ({ module, ...p }));

// Seed per the roles-permissions.html reference's four roles. The .html's
// View/Create/Update/Delete collapse onto the spec's View/Edit: any write action = Edit.
const SEEDED_ROLES = Object.freeze([
    { name: 'Super Admin', isSuperAdmin: true, isScoped: false, order: 0, permissions: [] },
    {
        name: 'Accountant', isScoped: false, order: 1,
        permissions: perms({ student: all(true, true), fees: all(true, true), payroll: all(true, true) }),
    },
    {
        name: 'Class Teacher', isScoped: true, order: 2,
        permissions: perms({
            student: all(true, true), attendance: all(true, true), marksheet: all(true, true), leave: all(true, false),
        }),
    },
    {
        name: 'Subject Teacher', isScoped: true, order: 3,
        permissions: perms({ student: all(true, false), marksheet: all(true, true) }),
    },
]);

const upsertIgnoringRace = async (work) => {
    try {
        return await work();
    } catch (error) {
        // A concurrent first request won the unique index — its row is the row.
        if (isDuplicateKey(error)) return null;
        throw error;
    }
};

/** Seed the default roles for a school if it has none. Returns the Super Admin role. */
const ensureSeededRoles = async (adminId) => {
    const existing = await RoleModel.findOne({ adminId, isSuperAdmin: true }).lean();
    if (existing) return existing;
    await Promise.all(SEEDED_ROLES.map((role) => upsertIgnoringRace(() => RoleModel.updateOne(
        { adminId, name: role.name },
        { $setOnInsert: { adminId, ...role, createdBy: 'system', updatedBy: 'system' } },
        { upsert: true, collation: { locale: 'en', strength: 2 } }
    ))));
    return RoleModel.findOne({ adminId, isSuperAdmin: true }).lean();
};

/**
 * The owner Staff row for this school (created from the admin account on first use) with
 * its Super Admin assignment guaranteed. Cached near-static: it never changes once made.
 * @returns {Promise<{ _id: string, name: string }>}
 */
const ensureOwner = async (adminId, adminUser = {}) => cacheService.wrap(
    cacheKeys.settings.ownerStaff(adminId),
    cacheService.TTL.NEAR_STATIC_45,
    async () => {
        const superAdmin = await ensureSeededRoles(adminId);
        await upsertIgnoringRace(() => StaffV2Model.updateOne(
            { adminId, isOwner: true },
            {
                $setOnInsert: {
                    adminId,
                    isOwner: true,
                    name: adminUser.name || 'School Owner',
                    adminUserId: adminUser.id ? String(adminUser.id) : null,
                    designation: 'Owner',
                    department: 'Admin',
                    createdBy: 'system',
                    updatedBy: 'system',
                },
            },
            { upsert: true }
        ));
        const owner = await StaffV2Model.findOne({ adminId, isOwner: true }, 'name').lean();
        await upsertIgnoringRace(() => RoleAssignmentModel.updateOne(
            { adminId, staffId: owner._id, roleId: superAdmin._id, scope: 'school' },
            { $setOnInsert: { adminId, staffId: owner._id, roleId: superAdmin._id, scope: 'school', classId: null, sectionId: null } },
            { upsert: true }
        ));
        return { _id: String(owner._id), name: owner.name };
    }
);

module.exports = { SEEDED_ROLES, ensureSeededRoles, ensureOwner };
