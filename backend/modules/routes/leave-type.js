'use strict';
const express = require('express');
const router = express.Router();
const validate = require('../middleware/validate');
const { createLeaveTypeSchema, updateLeaveTypeSchema } = require('../validators/leave-type');
const {
    GetAllLeaveType,
    GetApplicableLeaveType,
    countLeaveType,
    GetSingleLeaveType,
    CreateLeaveType,
    UpdateLeaveType,
    DeleteLeaveType,
    GetLeaveTypePagination,
} = require('../controllers/leave-type');

router.get('/leave-type-count/:adminId', countLeaveType);
router.get('/all-leave-type/:id', GetAllLeaveType);
// Declared BEFORE '/:id' — Express matches in order, so a literal segment that could also
// read as an id has to come first or it never gets reached.
router.get('/applicable/:adminId/:personType', GetApplicableLeaveType);
router.post('/leave-type-pagination', GetLeaveTypePagination);
router.get('/:id', GetSingleLeaveType);
router.post('/', validate(createLeaveTypeSchema), CreateLeaveType);
router.put('/:id', validate(updateLeaveTypeSchema), UpdateLeaveType);
router.delete('/:id', DeleteLeaveType);

module.exports = router;
