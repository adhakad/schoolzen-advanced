'use strict';
const express = require('express');
const router = express.Router();
const { GetAllDepartment, countDepartment, GetSingleDepartment, CreateDepartment, UpdateDepartment, DeleteDepartment, GetDepartmentPagination } = require('../controllers/department');

router.get('/department-count/:adminId', countDepartment);
router.get('/all-department/:id', GetAllDepartment);
router.post('/department-pagination', GetDepartmentPagination);
router.get('/:id', GetSingleDepartment);
router.post('/', CreateDepartment);
router.put('/:id', UpdateDepartment);
router.delete('/:id', DeleteDepartment);

module.exports = router;
