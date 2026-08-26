'use strict';
const express = require('express');
const router = express.Router();
const validate = require('../middleware/validate');
const { assignSalarySchema, bulkAssignSalarySchema } = require('../validators/salary-structure');
const {
    GetAssignSalaryPagination,
    GetSingleSalaryStructure,
    AssignSalary,
    BulkAssignSalary,
    DeleteSalaryStructure,
} = require('../controllers/salary-structure');

router.post('/assign-salary-pagination', GetAssignSalaryPagination);
router.post('/bulk-assign', validate(bulkAssignSalarySchema), BulkAssignSalary);
// Keyed by staffId, not by the structure id: the Assign form knows who it is editing, not
// whether that person has a row yet.
router.get('/staff/:adminId/:staffId', GetSingleSalaryStructure);
router.post('/', validate(assignSalarySchema), AssignSalary);
router.delete('/:id', DeleteSalaryStructure);

module.exports = router;
