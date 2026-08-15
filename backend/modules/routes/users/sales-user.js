'use strict';
const express = require('express');
const router = express.Router();
const { LoginSalesUser, RefreshSalesToken } = require('../../controllers/users/sales-user');

router.post('/login', LoginSalesUser);
router.post('/refresh', RefreshSalesToken);

module.exports = router;
