'use strict';
const express = require('express');
const router = express.Router();
const { GetAllStaff, countStaff, GetSingleStaff, CreateStaff, UpdateStaff, DeleteStaff, GetStaffPagination } = require('../controllers/staff');

router.get('/staff-count/:adminId', countStaff);
router.get('/all-staff/:id', GetAllStaff);
router.post('/staff-pagination', GetStaffPagination);
router.get('/:id', GetSingleStaff);
router.post('/', CreateStaff);
router.put('/:id', UpdateStaff);
router.delete('/:id', DeleteStaff);

module.exports = router;
