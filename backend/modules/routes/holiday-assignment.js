'use strict';
const express = require('express');
const router = express.Router();
const validate = require('../middleware/validate');
const {
    bulkAssignHolidaySchema,
    bulkAssignClassHolidaySchema,
} = require('../validators/holiday-assignment');
const {
    GetHolidayAssignmentGrid,
    BulkAssignHoliday,
    BulkAssignClassHoliday,
    DeleteHolidayAssignment,
    DeleteClassHolidayAssignment,
} = require('../controllers/holiday-assignment');

// Read endpoints take query params, which validate.js (a req.body validator) does not
// cover — those are checked inline in the controller, same as the leave-assignment reads.
router.get('/grid', GetHolidayAssignmentGrid);
router.post('/bulk-assign', validate(bulkAssignHolidaySchema), BulkAssignHoliday);
router.post('/bulk-assign-class', validate(bulkAssignClassHolidaySchema), BulkAssignClassHoliday);
// The class un-assign is declared BEFORE '/:id' — Express matches in order, and '/class/:id'
// would otherwise never be reached.
router.delete('/class/:id', DeleteClassHolidayAssignment);
router.delete('/:id', DeleteHolidayAssignment);

module.exports = router;
