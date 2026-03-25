'use strict';
const express = require('express');
const router = express.Router();
const {GetAllBoard} = require('../controllers/board');
router.get('/',GetAllBoard);
module.exports = router;