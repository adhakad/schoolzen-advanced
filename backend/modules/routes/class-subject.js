'use strict';
const express = require('express');
const router = express.Router();
const {GetAllClassSubject,countClassSubject,GetSubjectByClass,GetSingleClassSubjectByStream,GetSingleClassSubject,CreateClassSubject,UpdateClassSubject,DeleteClassSubject, GetClassSubjectPagination} = require('../controllers/class-subject');

router.get('/class-subject-count',countClassSubject);
// router.get('/',GetAllClassSubject);
router.post('/classSubject-pagination',GetClassSubjectPagination);
// router.get('/:id',GetSingleClassSubject);
// router.get('/subject/:class',GetSubjectByClass);
router.get('/admin/:id/subject/:class/stream/:stream',GetSingleClassSubjectByStream);
router.post('/',CreateClassSubject);
router.put('/:id',UpdateClassSubject);
router.delete('/:id',DeleteClassSubject);



module.exports = router;