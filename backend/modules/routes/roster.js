'use strict';
const express = require('express');
const router = express.Router();
const { GetRosterMonth, GetSingleRoster, GetExpectedShift, CreateRoster, UpdateRoster, DeleteRoster, BulkAssignRoster, BulkClearRoster } = require('../controllers/roster');

router.post('/roster-month', GetRosterMonth);
router.post('/bulk-assign', BulkAssignRoster);
router.post('/bulk-clear', BulkClearRoster);
router.get('/expected-shift/:adminId/:personType/:personId/:date', GetExpectedShift);
router.get('/:id', GetSingleRoster);
router.post('/', CreateRoster);
router.put('/:id', UpdateRoster);
router.delete('/:id', DeleteRoster);

module.exports = router;
