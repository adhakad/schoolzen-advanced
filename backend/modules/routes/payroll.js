'use strict';
const express = require('express');
const router = express.Router();
const validate = require('../middleware/validate');
const {
    generatePayrollSchema,
    bulkGeneratePayrollSchema,
    lockPayrollSchema,
    unlockPayrollSchema,
} = require('../validators/payroll');
const {
    GeneratePayroll,
    BulkGeneratePayroll,
    GetPayrollPagination,
    GetSinglePayroll,
    LockPayroll,
    UnlockPayroll,
} = require('../controllers/payroll');

router.post('/payroll-pagination', GetPayrollPagination);
// Declared BEFORE '/:id' — Express matches in order.
router.post('/generate', validate(generatePayrollSchema), GeneratePayroll);
router.post('/bulk-generate', validate(bulkGeneratePayrollSchema), BulkGeneratePayroll);
router.get('/:id', GetSinglePayroll);
router.put('/:id/lock', validate(lockPayrollSchema), LockPayroll);
// unlockPayrollSchema requires `confirm: true` — a request without it is rejected here and
// never reaches the handler. See validators/payroll.js.
router.put('/:id/unlock', validate(unlockPayrollSchema), UnlockPayroll);

module.exports = router;
