'use strict';
const express = require('express');
const router = express.Router();

const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const requirePermission = require('../../middleware/require-permission');
const validateRequest = require('../../middleware/validate-request');
const idempotency = require('../../middleware/idempotency');
const v = require('../../validators/approvals/approvals.validator');
const approvals = require('../../controllers/approvals/approvals.controller');

// Mounted at /api/v2/approvals — wiring only, no logic and no Mongoose calls.
//
// Explicit Roles & Permissions grants, enforced HERE on the backend:
//   'approvals'         view the inbox
//   'approvals-action'  approve / reject from it — and the controller additionally requires
//                       the row's source grant ('leave' edit), so the inbox never bypasses it.
// Every decision is written to the activity log (by the source's action and by this module).
//
// Idempotency-Key on Approve / Reject, the same as Leave Requests' own buttons.
const MODULE = 'approvals';
const scoped = [isAdminAuth, assertAdminScope(MODULE)];
const view = [...scoped, requirePermission('approvals', 'view')];
const act = [...scoped, requirePermission('approvals-action', 'edit')];
const idem = idempotency(MODULE);
const body = (schema) => validateRequest(schema, MODULE);
const query = (schema) => validateRequest(schema, MODULE, 'query');

router.get('/requests', ...view, query(v.listSchema), approvals.ListRequests);
router.put('/requests/:type/:id/approve', ...act, body(v.actionSchema), idem, approvals.ApproveRequest);
router.put('/requests/:type/:id/reject', ...act, body(v.actionSchema), idem, approvals.RejectRequest);

module.exports = router;
