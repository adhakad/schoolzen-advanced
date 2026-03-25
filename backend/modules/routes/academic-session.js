'use strict';
const express = require('express');
const router = express.Router();
const {GetAcademicSession} = require('../controllers/academic-session');

router.get('/',GetAcademicSession);

module.exports = router;