'use strict';
const express = require('express');
const router = express.Router();

const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const requirePermission = require('../../middleware/require-permission');
const validateRequest = require('../../middleware/validate-request');
const idempotency = require('../../middleware/idempotency');
const v = require('../../validators/payroll/payroll.validator');
const groups = require('../../controllers/payroll/salary-groups.controller');
const assign = require('../../controllers/payroll/assign-salary.controller');
const runs = require('../../controllers/payroll/generate-payroll.controller');
const payouts = require('../../controllers/payroll/salary-payouts.controller');

// Mounted at /api/v2/payroll — wiring only, no logic and no Mongoose calls.
//
// Four explicit Roles & Permissions grants, enforced HERE on the backend, never only by
// hiding a button:
//   'payroll'          view every Payroll page; add/edit/delete Salary Groups
//   'payroll-assign'   Assign Salary (single + bulk)
//   'payroll-generate' Generate / Regenerate / Lock / Unlock
//   'payroll-payout'   Record Payment, issue Salary Slips
//
// Idempotency-Key on generate, lock, unlock, record payment, confirm, dispute
// (payroll/optimization.md).
const MODULE = 'payroll';
const scoped = [isAdminAuth, assertAdminScope(MODULE)];
const view = [...scoped, requirePermission('payroll', 'view')];
const groupEdit = [...scoped, requirePermission('payroll', 'edit')];
const assignView = [...scoped, requirePermission('payroll-assign', 'view')];
const assignEdit = [...scoped, requirePermission('payroll-assign', 'edit')];
const generateEdit = [...scoped, requirePermission('payroll-generate', 'edit')];
const payoutEdit = [...scoped, requirePermission('payroll-payout', 'edit')];
const idem = idempotency(MODULE);
const body = (schema) => validateRequest(schema, MODULE);
const query = (schema) => validateRequest(schema, MODULE, 'query');

// Salary Groups
router.get('/salary-groups', ...view, query(v.salaryGroupListSchema), groups.GetSalaryGroups);
router.get('/salary-groups/options', ...assignView, query(v.salaryGroupOptionsSchema), groups.GetSalaryGroupOptions);
router.get('/salary-groups/:id', ...view, query(v.salaryGroupOptionsSchema), groups.GetSalaryGroup);
router.post('/salary-groups', ...groupEdit, body(v.salaryGroupSchema), groups.CreateSalaryGroup);
router.put('/salary-groups/:id', ...groupEdit, body(v.salaryGroupSchema), groups.UpdateSalaryGroup);
router.delete('/salary-groups/:id', ...groupEdit, query(v.deleteSchema), groups.DeleteSalaryGroup);

// Assign Salary — 'payroll-assign'
router.get('/assign', ...assignView, query(v.assignGridSchema), assign.GetAssignGrid);
router.put('/assign', ...assignEdit, body(v.assignSchema), assign.AssignSalary);
router.post('/assign/bulk', ...assignEdit, body(v.bulkAssignSchema), assign.BulkAssignSalary);

// Generate Payroll — viewing needs 'payroll'; every write 'payroll-generate'
router.get('/runs', ...view, query(v.runListSchema), runs.ListRuns);
router.get('/runs/:id', ...view, query(v.runActionSchema), runs.GetRun);
router.post('/runs/generate', ...generateEdit, body(v.generateSchema), idem, runs.GenerateRun);
router.post('/runs/generate/bulk', ...generateEdit, body(v.bulkGenerateSchema), idem, runs.BulkGenerate);
router.post('/runs/:id/lock', ...generateEdit, body(v.runActionSchema), idem, runs.LockRun);
router.post('/runs/:id/unlock', ...generateEdit, body(v.runActionSchema), idem, runs.UnlockRun);
router.get('/jobs/:jobId', ...view, query(v.jobStatusSchema), runs.GetJobStatus);

// Salary Payouts — viewing needs 'payroll'; recording and slips 'payroll-payout'
router.get('/payouts', ...view, query(v.payoutListSchema), payouts.ListPayouts);
router.post('/payouts/:runId/payments', ...payoutEdit, body(v.recordPaymentSchema), idem, payouts.RecordPayment);
router.post('/payouts/:runId/slip', ...payoutEdit, body(v.runActionSchema), payouts.GenerateSlip);

// The employee's own Confirm / Dispute — identity from the verified token's staffId only
// (unified Staff login); no adminId parameter, no admin permission involved.
router.put('/payouts/payments/:id/confirm', isAdminAuth, validateRequest(v.confirmSchema, MODULE), idem, payouts.ConfirmPayment);
router.put('/payouts/payments/:id/dispute', isAdminAuth, validateRequest(v.disputeSchema, MODULE), idem, payouts.DisputePayment);

module.exports = router;
