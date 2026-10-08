'use strict';
const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const requirePermission = require('../../middleware/require-permission');

// The one middleware chain every /api/v2/settings route starts with, so no route file can
// forget a link: verified token → tenant pinned to the token (req.adminId) → the caller's
// 'settings' permission (view for reads, edit for writes). Wiring only.
const scope = assertAdminScope('settings');

const canView = [isAdminAuth, scope, requirePermission('settings', 'view')];
const canEdit = [isAdminAuth, scope, requirePermission('settings', 'edit')];

module.exports = { canView, canEdit };
