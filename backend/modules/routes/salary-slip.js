'use strict';
const express = require('express');
const router = express.Router();
const validate = require('../middleware/validate');
const { generateSalarySlipSchema } = require('../validators/salary-slip');
const { GenerateSalarySlip, GetSalarySlip } = require('../controllers/salary-slip');

// Declared before any '/:id' route would be — Express matches in order.
router.get('/payroll/:adminId/:payrollId', GetSalarySlip);
router.post('/generate', validate(generateSalarySlipSchema), GenerateSalarySlip);

module.exports = router;
