'use strict';
const SalaryPaymentModel = require('../models/salary-payment');
const logger = require('../helpers/logger');

// LAPSING A CONFIRMATION REQUEST THAT NOBODY ANSWERED.
//
// A payment recorded against a teacher waits 24 hours for them to confirm receipt. Past that
// it stops being a live request and becomes a lapsed one — and an Expired payment settles
// nothing, exactly like the pending one it replaced (services/salary-payment-status.js). So
// this job does not change what any payroll is worth; it changes what the school SEES, from
// "waiting on the teacher" to "this never completed, re-record it".
//
// Why a job at all, when the read paths already compare against the clock: the Payment
// History list is a school's view of its own obligations, and a row that has quietly been
// dead for three days should say so rather than showing a countdown that ran out. The status
// on the row is what the admin acts on.
//
// ONE updateMany FOR EVERY SCHOOL AT ONCE. There is no per-tenant loop here: the query is
// equality on confirmationStatus and a range on confirmationExpiresAt, which is precisely the
// index models/salary-payment.js declares for it, so this stays one index walk whether the
// system holds two thousand schools or one.
//
// Runs in the API process from cron-job.js, alongside the plan and session sweeps — it is a
// single indexed write, not pipeline work, and does not belong in the BullMQ worker.
const expireStaleSalaryConfirmations = async () => {
    try {
        const now = new Date();
        const result = await SalaryPaymentModel.updateMany(
            {
                confirmationStatus: 'PendingConfirmation',
                // $lt, and never $lte: a request expiring at this exact instant is still open.
                confirmationExpiresAt: { $ne: null, $lt: now },
            },
            { $set: { confirmationStatus: 'Expired' } },
        );

        const expired = result.modifiedCount || 0;
        // Logged only when something happened. An hourly "expired 0" line every hour of every
        // day buries the one that matters.
        if (expired > 0) {
            logger.info('salary-payment.confirmationsExpired', { expired: expired });
        }
        return expired;
    } catch (error) {
        // Nothing is watching a UI when this runs, so the log is the only record it failed.
        // Swallowed rather than rethrown: node-cron has no error handling of its own and an
        // escaping rejection would take the API process down with it.
        logger.error('cron-salary-confirmation.expireStaleSalaryConfirmations', error);
        return 0;
    }
};

module.exports = { expireStaleSalaryConfirmations };
