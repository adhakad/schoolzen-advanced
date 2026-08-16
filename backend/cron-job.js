'use strict';
const cron = require('node-cron');
const { checkAndUpdateExpiredPlans } = require('./modules/services/cron-plan-service');
const { checkAndUpdateAcademicSession } = require('./modules/services/cron-session-service');
const {
  scheduleDailyAttendanceSync,
  scheduleReconcileSweep,
} = require('./modules/services/cron-attendance-service');

cron.schedule('1 0 * * *', () => {
  checkAndUpdateAcademicSession();
});
cron.schedule('0 0 * * *', () => {
  checkAndUpdateExpiredPlans();
});

// --- Attendance pipeline (Phase 6) ----------------------------------------------------
// Cron ENQUEUES only; every consumer runs in the separate worker.js process.
// ATTENDANCE_SYNC_CRON fires once at the start of the rolling window, and the scheduler
// spreads each school's job across SYNC_WINDOW_MINUTES from there — 2000 schools never
// stampede WDMS in the same second.
const SYNC_CRON = process.env.ATTENDANCE_SYNC_CRON || '0 8 * * *';
cron.schedule(SYNC_CRON, () => {
  scheduleDailyAttendanceSync();
});

// Steady 5-minute cadence rather than one enqueue per punch batch. jobId dedup collapses
// repeats, so this stays cheap however often it runs.
cron.schedule('*/5 * * * *', () => {
  scheduleReconcileSweep();
});
