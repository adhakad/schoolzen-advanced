'use strict';
const express = require('express');
const router = express.Router();
const { countTeacher,GetTeacherById, CreateTeacher, UpdateTeacher, ChangeStatus, DeleteTeacher, GetTeacherPagination, TeacherPermission } = require('../controllers/teacher');
const { isAdminAuth } = require('../middleware/admin-auth');

router.get('/teacher-count/:adminId',countTeacher);
router.get('/admin/:adminId/teacher/:teacherUserId',GetTeacherById);
router.post('/teacher-pagination', GetTeacherPagination);
router.post('/', isAdminAuth, CreateTeacher);
router.put('/permission/admin/:id/teacher/:teacherId', TeacherPermission);
router.put('/:id', isAdminAuth, UpdateTeacher);
router.put('/status/:id', ChangeStatus);
router.delete('/:id', isAdminAuth, DeleteTeacher);



module.exports = router;