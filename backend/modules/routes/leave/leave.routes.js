'use strict';
const express = require('express');
const router = express.Router();

const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const requirePermission = require('../../middleware/require-permission');
const validateRequest = require('../../middleware/validate-request');
const idempotency = require('../../middleware/idempotency');
const v = require('../../validators/leave/leave.validator');
const types = require('../../controllers/leave/leave-types.controller');
const requests = require('../../controllers/leave/leave-requests.controller');
const assign = require('../../controllers/leave/leave-assign.controller');

// Mounted at /api/v2/leave — wiring only, no logic and no Mongoose calls.
//
// Two permissions (Roles & Permissions): 'leave' for types + requests, and 'leave-limit' for
// every Leave Assign endpoint — setting allowances is a separate grant, enforced here on
// the backend, never only by hiding a button.
//
// Idempotency-Key on Apply / Approve / Reject (leave/optimization.md). Bulk assign is
// idempotent-by-upsert and needs none.
const MODULE = 'leave';
const scoped = [isAdminAuth, assertAdminScope(MODULE)];
const leaveView = [...scoped, requirePermission('leave', 'view')];
const leaveEdit = [...scoped, requirePermission('leave', 'edit')];
const limitView = [...scoped, requirePermission('leave-limit', 'view')];
const limitEdit = [...scoped, requirePermission('leave-limit', 'edit')];
const idem = idempotency(MODULE);
const body = (schema) => validateRequest(schema, MODULE);
const query = (schema) => validateRequest(schema, MODULE, 'query');

// Leave Create
router.get('/types', ...leaveView, query(v.leaveTypeListSchema), types.GetLeaveTypes);
router.get('/types/options', ...leaveView, query(v.leaveTypeOptionsSchema), types.GetLeaveTypeOptions);
router.post('/types', ...leaveEdit, body(v.leaveTypeSchema), types.CreateLeaveType);
router.put('/types/:id', ...leaveEdit, body(v.leaveTypeSchema), types.UpdateLeaveType);
router.delete('/types/:id', ...leaveEdit, types.DeleteLeaveType);

// Requests
router.get('/requests', ...leaveView, query(v.requestListSchema), requests.ListRequests);
router.get('/requests/people', ...leaveView, query(v.peopleOptionsSchema), requests.GetPeopleOptions);
router.get('/requests/balance', ...leaveView, query(v.balanceSchema), requests.GetBalance);
router.post('/requests', ...leaveEdit, body(v.createRequestSchema), idem, requests.CreateRequest);
router.put('/requests/:id/approve', ...leaveEdit, body(v.approveSchema), idem, requests.ApproveRequest);
router.put('/requests/:id/reject', ...leaveEdit, body(v.rejectSchema), idem, requests.RejectRequest);
router.put('/requests/:id/cancel', ...leaveEdit, body(v.cancelSchema), requests.CancelRequest);
router.delete('/requests/:id', ...leaveEdit, requests.DeleteRequest);

// Leave Assign — 'leave-limit' permission only
router.get('/assign/staff', ...limitView, query(v.staffGridSchema), assign.GetStaffGrid);
router.post('/assign/staff/bulk', ...limitEdit, body(v.staffBulkSchema), assign.BulkAssignStaff);
router.get('/assign/classes', ...limitView, query(v.classGridSchema), assign.GetClassGrid);
router.get('/assign/classes/students', ...limitView, query(v.classStudentsSchema), assign.GetClassStudents);
router.post('/assign/classes', ...limitEdit, body(v.classAssignSchema), assign.AssignClasses);
router.put('/assign/limit', ...limitEdit, body(v.personLimitSchema), assign.SetPersonLimit);

module.exports = router;
