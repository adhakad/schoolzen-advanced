'use strict';
const express = require('express');
const router = express.Router();
const validate = require('../middleware/validate');
const { bulkAssignLeaveSchema } = require('../validators/leave-assignment');
const { GetLeaveAssignmentGrid, BulkAssignLeave } = require('../controllers/leave-assignment');

// Read endpoints take query params, which validate.js (a req.body validator) does not
// cover — those are checked inline in the controller, same as the leave-request reads.
router.get('/grid', GetLeaveAssignmentGrid);
router.post('/bulk-assign', validate(bulkAssignLeaveSchema), BulkAssignLeave);

module.exports = router;
