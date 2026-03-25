'use strict';
const express = require('express');
const router = express.Router();
const {GetAllClass,countClass,GetSingleClass,CreateClass,UpdateClass,DeleteClass, GetClassPagination} = require('../controllers/class');

router.get('/class-count',countClass);
router.get('/',GetAllClass);
router.post('/class-pagination',GetClassPagination);
router.get('/:id',GetSingleClass);
router.post('/',CreateClass);
router.put('/:id',UpdateClass);
router.delete('/:id',DeleteClass);



module.exports = router;