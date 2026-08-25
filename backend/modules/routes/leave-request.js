'use strict';
const express = require('express');
const router = express.Router();
const validate = require('../middleware/validate');
const { isTeacherAuth } = require('../middleware/teacher-auth');
const {
    createLeaveRequestSchema,
    createTeacherLeaveRequestSchema,
    actionLeaveRequestSchema,
    approveLeaveRequestSchema,
    cancelLeaveRequestSchema,
} = require('../validators/leave-request');
const {
    GetLeaveRequestPagination,
    GetLeaveBalance,
    GetSingleLeaveRequest,
    CreateLeaveRequest,
    CreateTeacherLeaveRequest,
    ApproveLeaveRequest,
    RejectLeaveRequest,
    CancelLeaveRequest,
    DeleteLeaveRequest,
} = require('../controllers/leave-request');

router.post('/leave-request-pagination', GetLeaveRequestPagination);
// Declared BEFORE '/:id' so the literal segment is reachable.
router.get('/balance', GetLeaveBalance);
router.get('/:id', GetSingleLeaveRequest);

router.post('/', validate(createLeaveRequestSchema), CreateLeaveRequest);
// The ONE authenticated route in this module. A teacher may only file for themselves or for
// a student of a class their leavePermission covers, and the controller takes adminId and
// their own personId from the verified token — never from the body. The teacher schema does
// not declare those fields, so validate.js's stripUnknown discards them before the
// controller ever sees them.
router.post('/teacher', isTeacherAuth, validate(createTeacherLeaveRequestSchema), CreateTeacherLeaveRequest);

router.put('/:id/approve', validate(approveLeaveRequestSchema), ApproveLeaveRequest);
router.put('/:id/reject', validate(actionLeaveRequestSchema), RejectLeaveRequest);
// PATCH, not PUT: cancelling amends an approved request in place rather than replacing it —
// its leaveDates and dayCount survive as the record of what was granted.
router.patch('/:id/cancel', validate(cancelLeaveRequestSchema), CancelLeaveRequest);
router.delete('/:id', DeleteLeaveRequest);

module.exports = router;
