'use strict';
const express = require('express');
const router = express.Router();
const { GetAllBiometricMapping, GetSingleBiometricMapping, CreateBiometricMapping, UpdateBiometricMapping, DeleteBiometricMapping, AssignCard, BulkAssignCard } = require('../controllers/biometric-mapping');

router.get('/all-biometric-mapping/:id', GetAllBiometricMapping);
router.post('/assign-card', AssignCard);
router.post('/bulk-assign-card', BulkAssignCard);
router.get('/:id', GetSingleBiometricMapping);
router.post('/', CreateBiometricMapping);
router.put('/:id', UpdateBiometricMapping);
router.delete('/:id', DeleteBiometricMapping);

module.exports = router;
