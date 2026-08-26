'use strict';
const express = require('express');
const router = express.Router();
const validate = require('../middleware/validate');
const { createHolidaySchema, updateHolidaySchema } = require('../validators/holiday');
const {
    countHoliday,
    GetHolidayPagination,
    GetAllHoliday,
    GetSingleHoliday,
    CreateHoliday,
    UpdateHoliday,
    DeleteHoliday,
} = require('../controllers/holiday');

router.get('/holiday-count/:adminId', countHoliday);
router.post('/holiday-pagination', GetHolidayPagination);
// Declared BEFORE '/:id' — Express matches in order, so a literal segment that could also
// read as an id has to come first or it never gets reached.
router.get('/all-holiday/:id', GetAllHoliday);
router.get('/:id', GetSingleHoliday);
router.post('/', validate(createHolidaySchema), CreateHoliday);
router.put('/:id', validate(updateHolidaySchema), UpdateHoliday);
router.delete('/:id', DeleteHoliday);

module.exports = router;
