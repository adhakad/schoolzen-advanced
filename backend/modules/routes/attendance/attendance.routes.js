'use strict';
const express = require('express');
const router = express.Router();

const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const validateRequest = require('../../middleware/validate-request');
const requirePermission = require('../../middleware/require-permission');
const idempotency = require('../../middleware/idempotency');
const v = require('../../validators/attendance/attendance.validator');
const shifts = require('../../controllers/attendance/shifts.controller');
const roster = require('../../controllers/attendance/roster.controller');
const overview = require('../../controllers/attendance/overview.controller');

// Mounted at /api/v2/attendance — wiring only, no logic and no Mongoose calls.
//
// Sync is deduped by its BullMQ jobId and punches by the punchHash index; a manual mark
// additionally carries an Idempotency-Key (double-click guard).
const MODULE = 'attendance';
const base = [isAdminAuth, assertAdminScope(MODULE)];
// Manual marking needs its own explicit grant, and an Idempotency-Key so a double click can
// never write twice (attendance-fix1.md §3d).
const markGuard = [...base, requirePermission('attendance-mark', 'edit'), idempotency(MODULE)];
const body = (schema) => validateRequest(schema, MODULE);
const query = (schema) => validateRequest(schema, MODULE, 'query');

// Manage Shifts
router.get('/shifts', ...base, query(v.shiftListSchema), shifts.GetShifts);
router.get('/shifts/options', ...base, shifts.GetShiftOptions);
router.post('/shifts', ...base, body(v.shiftSchema), shifts.CreateShift);
router.put('/shifts/:id', ...base, body(v.shiftSchema), shifts.UpdateShift);
router.delete('/shifts/:id', ...base, shifts.DeleteShift);

// Roster
router.get('/roster/staff', ...base, query(v.rosterGridSchema), roster.GetStaffRoster);
router.post('/roster/staff/assign', ...base, body(v.rosterAssignSchema), roster.AssignStaffRoster);
router.post('/roster/staff/clear', ...base, body(v.rosterClearSchema), roster.ClearStaffRoster);
router.get('/roster/classes', ...base, query(v.classShiftListSchema), roster.GetClassShifts);
router.post('/roster/classes/assign', ...base, body(v.classShiftAssignSchema), roster.AssignClassShifts);
router.post('/roster/classes/clear', ...base, body(v.classShiftClearSchema), roster.ClearClassShifts);

// Overview
router.get('/grid', ...base, query(v.gridSchema), overview.GetGrid);
router.get('/live-status', ...base, query(v.dayQuerySchema), overview.GetLiveStatus);
router.get('/recent-arrivals', ...base, query(v.dayQuerySchema), overview.GetRecentArrivals);
router.get('/day-punches', ...base, query(v.dayPunchesSchema), overview.GetDayPunches);
router.post('/sync', ...base, body(v.syncSchema), overview.SyncNow);
router.get('/sync-status', ...base, query(v.dayQuerySchema), overview.GetSyncStatus);
router.post('/mark', ...markGuard, body(v.markSchema), overview.MarkAttendance);

module.exports = router;
