'use strict';
const express = require('express');
const router = express.Router();
const {GetAllSubject,countSubject,CreateSubject,UpdateSubject,DeleteSubject, GetSubjectPagination} = require('../controllers/subject');

router.get('/subject-count',countSubject);
router.get('/all-subject/:id',GetAllSubject);
router.post('/subject-pagination',GetSubjectPagination);
router.post('/',CreateSubject);
router.put('/:id',UpdateSubject);
router.delete('/:id',DeleteSubject);



module.exports = router;