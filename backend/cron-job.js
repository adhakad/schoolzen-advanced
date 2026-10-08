'use strict';
const cron = require('node-cron');
const { checkAndUpdateExpiredPlans } = require('./modules/services/cron-plan-service');
const { checkAndUpdateAcademicSession } = require('./modules/services/cron-session-service');
const {
  scheduleDailyAttendanceSync,
  scheduleReconcileSweep,
} = require('./modules/services/cron-attendance-service');
const {
  expireStaleSalaryConfirmations,
} = require('./modules/services/cron-salary-confirmation-service');

cron.schedule('1 0 * * *', () => {
  checkAndUpdateAcademicSession();
});
cron.schedule('0 0 * * *', () => {
  checkAndUpdateExpiredPlans();
});

// Salary payments a teacher never confirmed. Hourly rather than daily: the window is 24
// hours, so a daily pass would leave a lapsed request looking live for most of a day. One
// indexed updateMany across every school — see the service header.
cron.schedule('0 * * * *', () => {
  expireStaleSalaryConfirmations();
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

// --- v2 Attendance --------------------------------------------------------------------
// Opt-in (ATTENDANCE_V2_AUTO_SYNC=true) so a school isn't pulled by both pipelines at once.
// Each school's job is staggered inside SYNC_WINDOW_MINUTES by the queue itself.
if (process.env.ATTENDANCE_V2_AUTO_SYNC === 'true') {
  const { scheduleV2AutoSync } = require('./modules/services/attendance-v2/auto-sync');
  cron.schedule(process.env.ATTENDANCE_V2_SYNC_CRON || '*/15 7-19 * * *', () => {
    scheduleV2AutoSync();
  });
}
