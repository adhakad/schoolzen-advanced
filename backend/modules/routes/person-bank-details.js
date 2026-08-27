'use strict';
const express = require('express');
const router = express.Router();
const validate = require('../middleware/validate');
const { savePersonBankDetailsSchema } = require('../validators/person-bank-details');
const { GetPersonBankDetails, SavePersonBankDetails } = require('../controllers/person-bank-details');

router.get('/:adminId/:personType/:personId', GetPersonBankDetails);
router.post('/', validate(savePersonBankDetailsSchema), SavePersonBankDetails);

module.exports = router;
