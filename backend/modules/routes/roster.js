'use strict';
const express = require('express');
const router  = express.Router();
const {
    GetRosterMonth,
    GetExpectedShift,
    CreateRoster,
    DeleteRoster,
    BulkAssignRoster,
    BulkClearRoster,
} = require('../controllers/roster');

router.get('/roster-month',  GetRosterMonth);   // GET — query params
router.post('/bulk-assign',  BulkAssignRoster);
router.post('/bulk-clear',   BulkClearRoster);
router.get('/expected-shift/:adminId/:personType/:personId/:date', GetExpectedShift);
router.post('/',             CreateRoster);      // single cell assign
router.delete('/',           DeleteRoster);      // single cell clear (body: personId + date)

module.exports = router;