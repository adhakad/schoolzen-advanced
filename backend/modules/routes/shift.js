'use strict';
const express = require('express');
const router = express.Router();
const { GetAllShift, countShift, GetSingleShift, CreateShift, UpdateShift, DeleteShift, GetShiftPagination } = require('../controllers/shift');

router.get('/shift-count/:adminId', countShift);
router.get('/all-shift/:id', GetAllShift);
router.post('/shift-pagination', GetShiftPagination);
router.get('/:id', GetSingleShift);
router.post('/', CreateShift);
router.put('/:id', UpdateShift);
router.delete('/:id', DeleteShift);

module.exports = router;
