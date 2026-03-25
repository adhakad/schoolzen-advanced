'use strict';
const express = require('express');
const router = express.Router();
const { OrderIdCard } = require('../controllers/id-card');

router.get('/:id', OrderIdCard);

module.exports = router;