'use strict';
const express = require('express');
const router = express.Router();

const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const requirePermission = require('../../middleware/require-permission');
const validateRequest = require('../../middleware/validate-request');
const idempotency = require('../../middleware/idempotency');
const v = require('../../validators/fees/fees.validator');
const structures = require('../../controllers/fees/fee-structure.controller');
const fees = require('../../controllers/fees/fees.controller');
const statement = require('../../controllers/fees/fee-statement.controller');
const reminders = require('../../controllers/fees/fee-reminder.controller');
// Registers the arrears carry-forward with Class Promotion in this process too.
require('../../helpers/fees/fee-promotion');

// Mounted at /api/v2/fees — wiring only, no logic and no Mongoose calls.
//
// Explicit Roles & Permissions grants, enforced HERE on the backend, never only by hiding a
// button (every write is also written to the activity log by its controller):
//   'fees'            view every Fees page; keep Fee Reminder filters and send reminders (edit)
//   'fees-structure'  create / edit / delete Fee Structures
//   'fees-collect'    collect a payment
//   'fees-waiver'     grant / change a student's concession
//
// Idempotency-Key on collect, concession and reminder sends (fees/optimization.md).
const MODULE = 'fees';
const scoped = [isAdminAuth, assertAdminScope(MODULE)];
const view = [...scoped, requirePermission('fees', 'view')];
const feesEdit = [...scoped, requirePermission('fees', 'edit')];
const structureEdit = [...scoped, requirePermission('fees-structure', 'edit')];
const collect = [...scoped, requirePermission('fees-collect', 'edit')];
const waiver = [...scoped, requirePermission('fees-waiver', 'edit')];
const idem = idempotency(MODULE);
const body = (schema) => validateRequest(schema, MODULE);
const query = (schema) => validateRequest(schema, MODULE, 'query');

// Fee Structure
router.get('/structures', ...view, query(v.structureListSchema), structures.GetFeeStructures);
router.get('/structures/:id', ...view, query(v.structureReadSchema), structures.GetFeeStructure);
router.post('/structures', ...structureEdit, body(v.structureSchema), structures.CreateFeeStructure);
router.put('/structures/:id', ...structureEdit, body(v.structureSchema), structures.UpdateFeeStructure);
router.delete('/structures/:id', ...structureEdit, query(v.deleteSchema), structures.DeleteFeeStructure);

// Fees (collection)
router.get('/collection', ...view, query(v.feesListSchema), fees.ListFees);
router.post('/collection/report', ...view, body(v.reportSchema), fees.GetFeeReport);
router.post('/collection/:studentId/collect', ...collect, body(v.collectSchema), idem, fees.CollectFee);
router.put('/collection/:studentId/concession', ...waiver, body(v.concessionSchema), idem, fees.UpdateConcession);
router.get('/payments/:paymentId/receipt', ...view, query(v.readSchema), fees.GetReceipt);

// Fee Statement
router.get('/statement/:studentId', ...view, query(v.sessionReadSchema), statement.GetFeeStatement);

// Fee Reminder
router.get('/reminders', ...view, query(v.readSchema), reminders.ListReminderFilters);
router.post('/reminders', ...feesEdit, body(v.reminderFilterSchema), reminders.CreateReminderFilter);
router.post('/reminders/preview', ...view, body(v.previewSchema), reminders.PreviewFilter);
router.post('/reminders/send', ...feesEdit, body(v.sendSchema), idem, reminders.SendFilter);
router.get('/reminders/:id/preview', ...view, query(v.savedPreviewSchema), reminders.PreviewSavedFilter);
router.post('/reminders/:id/send', ...feesEdit, body(v.savedSendSchema), idem, reminders.SendSavedFilter);
router.delete('/reminders/:id', ...feesEdit, query(v.readSchema), reminders.DeleteReminderFilter);
router.get('/jobs/:jobId', ...view, query(v.readSchema), reminders.GetJobStatus);

module.exports = router;
