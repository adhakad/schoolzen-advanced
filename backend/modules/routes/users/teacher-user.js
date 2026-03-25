'use strict';
const express = require('express');
const router = express.Router();
const {SignupTeacher,LoginTeacher,RefreshToken} = require('../../controllers/users/teacher-user');

router.post('/signup',SignupTeacher);
router.post('/login',LoginTeacher);
router.post('/refresh',RefreshToken);



module.exports = router;