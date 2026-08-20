'use strict';
const express = require('express');
const router = express.Router();
const { GetAllBiometricMapping, GetSingleBiometricMapping, CreateBiometricMapping, UpdateBiometricMapping, DeleteBiometricMapping, AssignCard, BulkAssignCard, ResyncPerson } = require('../controllers/biometric-mapping');

router.get('/all-biometric-mapping/:id', GetAllBiometricMapping);
router.post('/assign-card', AssignCard);
router.post('/bulk-assign-card', BulkAssignCard);
// Above the bare POST '/' and the GET '/:id' catch-all, or Express matches those first.
router.post('/resync', ResyncPerson);
router.get('/:id', GetSingleBiometricMapping);
router.post('/', CreateBiometricMapping);
router.put('/:id', UpdateBiometricMapping);
router.delete('/:id', DeleteBiometricMapping);

module.exports = router;
