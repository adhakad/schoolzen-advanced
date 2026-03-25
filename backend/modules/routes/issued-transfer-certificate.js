'use strict';
const express = require('express');
const router = express.Router();
const { CreateIssuedTransferCertificate,countIssuedTransferCertificate,GetIssuedTransferCertificatePagination, DeleteIssuedTransferCertificate} = require('../controllers/issued-transfer-certificate');

router.get('/issued-transfer-certificate-count/:adminId', countIssuedTransferCertificate);
router.post('/issued-transfer-certificate-pagination', GetIssuedTransferCertificatePagination);
router.post('/', CreateIssuedTransferCertificate);
router.delete('/:id', DeleteIssuedTransferCertificate);


module.exports = router;