'use strict';
const express = require('express');
const router = express.Router();
const validate = require('../middleware/validate');
const { createSalaryGroupSchema, updateSalaryGroupSchema } = require('../validators/salary-group');
const {
    countSalaryGroup,
    GetSalaryGroupPagination,
    GetAllSalaryGroup,
    GetActiveSalaryGroup,
    GetSingleSalaryGroup,
    CreateSalaryGroup,
    UpdateSalaryGroup,
    DeleteSalaryGroup,
} = require('../controllers/salary-group');

router.get('/salary-group-count/:adminId', countSalaryGroup);
router.get('/all-salary-group/:id', GetAllSalaryGroup);
// Declared BEFORE '/:id' — Express matches in order, so a literal segment that could also
// read as an id has to come first or it never gets reached.
router.get('/active-salary-group/:adminId', GetActiveSalaryGroup);
router.post('/salary-group-pagination', GetSalaryGroupPagination);
router.get('/:id', GetSingleSalaryGroup);
router.post('/', validate(createSalaryGroupSchema), CreateSalaryGroup);
router.put('/:id', validate(updateSalaryGroupSchema), UpdateSalaryGroup);
router.delete('/:id', DeleteSalaryGroup);

module.exports = router;
