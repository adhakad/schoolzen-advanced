'use strict';
const PayrollPaymentV2Model = require('../../models/payroll/payroll-payment');
const logger = require('../../helpers/logger');

// v2 salary payments the employee never confirmed (salary-payouts.md, Confirmation flow).
// Hourly: one indexed updateMany across every school flips `pending` past its 24h window to
// `expired` — the admin re-records a fresh pending cycle if the money is still owed. Readers
// never depend on this having run (they check confirmationExpiresAt directly); it only keeps
// the stored status honest.
const expireStalePayrollConfirmations = async () => {
    try {
        const now = new Date();
        const result = await PayrollPaymentV2Model.updateMany(
            { confirmationStatus: 'pending', confirmationExpiresAt: { $lte: now } },
            { $set: { confirmationStatus: 'expired', updatedAt: now } }
        );
        if (result.modifiedCount) logger.info('payroll.confirmations.expired', { count: result.modifiedCount });
    } catch (error) {
        logger.error('payroll.confirmations.expireFailed', error);
    }
};

module.exports = { expireStalePayrollConfirmations };
