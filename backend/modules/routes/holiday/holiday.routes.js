'use strict';
const express = require('express');
const router = express.Router();

const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const requirePermission = require('../../middleware/require-permission');
const validateRequest = require('../../middleware/validate-request');
const v = require('../../validators/holiday/holiday.validator');
const holidays = require('../../controllers/holiday/holidays.controller');
const templates = require('../../controllers/holiday/templates.controller');
const assign = require('../../controllers/holiday/assign.controller');

// Mounted at /api/v2/holiday — wiring only, no logic and no Mongoose calls.
//
// Two permissions (Roles & Permissions), enforced here on the backend: 'holiday' for the
// Holidays + Templates pages, 'holiday-assign' for deciding whose calendar is whose.
// No Idempotency-Key (holiday/optimization.md): every write is safe to retry.
const MODULE = 'holiday';
const scoped = [isAdminAuth, assertAdminScope(MODULE)];
const holidayView = [...scoped, requirePermission('holiday', 'view')];
const holidayEdit = [...scoped, requirePermission('holiday', 'edit')];
const assignView = [...scoped, requirePermission('holiday-assign', 'view')];
const assignEdit = [...scoped, requirePermission('holiday-assign', 'edit')];
const body = (schema) => validateRequest(schema, MODULE);
const query = (schema) => validateRequest(schema, MODULE, 'query');

// Holidays
router.get('/holidays', ...holidayView, query(v.holidayListSchema), holidays.GetHolidays);
router.get('/holidays/options', ...holidayView, query(v.holidayOptionsSchema), holidays.GetHolidayOptions);
router.post('/holidays', ...holidayEdit, body(v.holidaySchema), holidays.CreateHoliday);
router.put('/holidays/:id', ...holidayEdit, body(v.holidaySchema), holidays.UpdateHoliday);
router.delete('/holidays/:id', ...holidayEdit, holidays.DeleteHoliday);
router.get('/system-holidays/states', ...holidayView, holidays.GetSystemStates);
router.post('/holidays/generate', ...holidayEdit, body(v.generateSchema), holidays.GenerateFromPublic);

// Templates
router.get('/templates', ...holidayView, query(v.templateListSchema), templates.GetTemplates);
router.get('/templates/options', ...scoped, templates.GetTemplateOptions);
router.post('/templates', ...holidayEdit, body(v.templateSchema), templates.CreateTemplate);
router.put('/templates/:id', ...holidayEdit, body(v.templateSchema), templates.UpdateTemplate);
router.delete('/templates/:id', ...holidayEdit, templates.DeleteTemplate);

// Assign — 'holiday-assign' only
router.get('/assign', ...assignView, query(v.assignGridSchema), assign.GetGrid);
router.post('/assign', ...assignEdit, body(v.assignSchema), assign.AssignTemplate);
router.post('/assign/remove', ...assignEdit, body(v.unassignSchema), assign.UnassignTemplate);

// Counts only, for the Leave / Attendance "no template" banner — any signed-in school user.
router.get('/coverage', ...scoped, query(v.coverageSchema), assign.GetCoverage);

module.exports = router;
