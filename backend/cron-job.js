'use strict';
const cron = require('node-cron');
const { checkAndUpdateExpiredPlans } = require('./modules/services/cron-plan-service');
const { checkAndUpdateAcademicSession } = require('./modules/services/cron-session-service');

cron.schedule('1 0 * * *', () => {
  checkAndUpdateAcademicSession();
});
cron.schedule('0 0 * * *', () => {
  checkAndUpdateExpiredPlans();
});