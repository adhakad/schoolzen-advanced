'use strict';
const express = require('express');
const router = express.Router();
const {GetAllStudentAdmitCardByClass,GetSingleStudentAdmitCard,GetSingleStudentAdmitCardById} = require('../controllers/admit-card');

router.get('/admin/:id/class/:class/stream/:stream',GetAllStudentAdmitCardByClass);
router.get('/student/:id',GetSingleStudentAdmitCardById);
router.post('/',GetSingleStudentAdmitCard);

module.exports = router;