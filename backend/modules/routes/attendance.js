'use strict';
const express = require('express');
const router = express.Router();
const validate = require('../middleware/validate');
const { manualAttendanceSchema, syncNowSchema } = require('../validators/attendance');
const {
    GetAttendanceCalendar,
    GetAttendanceMonthGrid,
    GetDaySummary,
    GetAttendancePeople,
    GetPunchLog,
    CreateManualAttendance,
    DeleteManualAttendance,
    SyncSchoolNow,
    GetSyncState,
    GetQueueHealth,
} = require('../controllers/attendance');

// Health first — it must stay reachable (and cheap) even when everything else is failing.
router.get('/health', GetQueueHealth);

router.get('/calendar', GetAttendanceCalendar);      // GET — query params
router.get('/calendar-month', GetAttendanceMonthGrid);
router.get('/day-summary', GetDaySummary);
router.get('/people', GetAttendancePeople);
router.get('/punch-log', GetPunchLog);
router.get('/sync-state', GetSyncState);

router.post('/manual', validate(manualAttendanceSchema), CreateManualAttendance);
// DELETE with a body (Express supports it; Angular HttpClient passes { body }) — same
// convention as routes/roster.js's single-cell clear.
router.delete('/manual', DeleteManualAttendance);
router.post('/sync-now', validate(syncNowSchema), SyncSchoolNow);

module.exports = router;
