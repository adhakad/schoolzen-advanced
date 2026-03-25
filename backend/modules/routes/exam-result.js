'use strict';
const express = require('express');
const router = express.Router();
const {GetSingleStudentExamResult,countExamResult,GetSingleStudentExamResultById,GetAllStudentExamResultByClass,GetAllStudentResultByClassStream,CreateExamResult,DeleteMarksheetResult} = require('../controllers/exam-result');

router.get('/exam-result-count/:adminId', countExamResult);
router.get('/student/:id',GetSingleStudentExamResultById);
router.get('/admin/:id/class/:class/stream/:stream',GetAllStudentExamResultByClass);
router.get('/admin/:id/result/class/:class/stream/:stream',GetAllStudentResultByClassStream);
router.post('/',CreateExamResult);
// router.post('/bulk-exam-result',CreateBulkExamResult);
router.post('/result',GetSingleStudentExamResult);
router.delete('/:id',DeleteMarksheetResult);

module.exports = router;