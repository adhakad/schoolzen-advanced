'use strict';
const express = require('express');
const router = express.Router();
const {
    GetClassOptions,
    GetAllClassShift,
    BulkAssignClassShift,
    DeleteClassShift,
} = require('../controllers/class-shift');

// Literal paths before the '/:adminId' parameter route, or '/classes/x' would be swallowed
// by it — the same ordering hazard routes/biometric-mapping.js has with its GET '/:id'.
router.get('/classes/:adminId', GetClassOptions);
router.get('/:adminId', GetAllClassShift);

router.post('/bulk-assign', BulkAssignClassShift);
router.delete('/:id', DeleteClassShift);

module.exports = router;
