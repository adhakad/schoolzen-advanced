'use strict';
const express = require('express');
const router = express.Router();

const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const { loadPermissions, resolveStaffId } = require('../../middleware/require-permission');
const validateRequest = require('../../middleware/validate-request');
const v = require('../../validators/dashboard/dashboard.validator');
const dashboard = require('../../controllers/dashboard/dashboard.controller');

// Mounted at /api/v2/dashboard — wiring only, no logic and no Mongoose calls.
//
// The page itself needs no grant of its own: every WIDGET is gated by its source module's
// View (helpers/dashboard/widgets.js), enforced here on the backend — a slice the viewer
// can't see is never computed into their response. So this route only resolves the caller's
// effective permissions (the same cached lookup requirePermission uses) onto req.
const MODULE = 'dashboard';

const resolvePermissions = async (req, res, next) => {
    try {
        const staffId = await resolveStaffId(req);
        req.staffId = staffId;
        req.permissions = await loadPermissions(req.adminId, staffId);
        return next();
    } catch (error) {
        return next(error);
    }
};

const read = [isAdminAuth, assertAdminScope(MODULE), resolvePermissions];
const query = (schema) => validateRequest(schema, MODULE, 'query');

router.get('/', ...read, query(v.dashboardSchema), dashboard.GetDashboard);
router.get('/widgets/:key', ...read, query(v.widgetSchema), dashboard.GetWidget);

module.exports = router;
