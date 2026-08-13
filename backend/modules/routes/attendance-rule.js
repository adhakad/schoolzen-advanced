'use strict';
const express = require('express');
const router = express.Router();
const { GetSingleAttendanceRule, CreateAttendanceRule, UpdateAttendanceRule } = require('../controllers/attendance-rule');

router.get('/:id', GetSingleAttendanceRule);
router.post('/', CreateAttendanceRule);
router.put('/:id', UpdateAttendanceRule);

module.exports = router;
