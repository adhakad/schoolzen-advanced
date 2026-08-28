'use strict';
const express = require('express');
const router = express.Router();
const validate = require('../middleware/validate');
const { isTeacherAuth } = require('../middleware/teacher-auth');
const { recordPaymentSchema, disputePaymentSchema } = require('../validators/salary-payment');
const {
    RecordPayment,
    GetPaymentsForPayroll,
    GetPaymentHistory,
    ConfirmPayment,
    DisputePayment,
    GetMyPayments,
} = require('../controllers/salary-payment');

router.post('/payment-history', GetPaymentHistory);
// Declared BEFORE any '/:id' route — Express matches in order, and 'my-payments' would
// otherwise be read as an id.
router.get('/my-payments', isTeacherAuth, GetMyPayments);
router.get('/payroll/:payrollId', GetPaymentsForPayroll);
router.post('/', validate(recordPaymentSchema), RecordPayment);
// THE ONLY AUTHENTICATED WRITES IN THIS MODULE. Everything above takes adminId off the body
// like the rest of the payroll routes; these two decide whether money counts as paid, so the
// acting person is taken from the verified teacher token and nothing else — the controller
// resolves their Teacher record itself and refuses a payment that is not theirs.
router.put('/:id/confirm', isTeacherAuth, ConfirmPayment);
router.put('/:id/dispute', isTeacherAuth, validate(disputePaymentSchema), DisputePayment);

module.exports = router;
