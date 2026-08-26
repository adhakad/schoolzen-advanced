'use strict';
const express = require('express');
const router = express.Router();
const validate = require('../middleware/validate');
const { saveStaffBankDetailsSchema } = require('../validators/staff-bank-details');
const { GetStaffBankDetails, SaveStaffBankDetails } = require('../controllers/staff-bank-details');

router.get('/:adminId/:staffId', GetStaffBankDetails);
router.post('/', validate(saveStaffBankDetailsSchema), SaveStaffBankDetails);

module.exports = router;
