'use strict';
const express = require('express');
const router = express.Router();
const { GetSingleClassAdmitCardStructure, GetSingleClassAdmitCardStructureByStream, CreateAdmitCardStructure, UpdateAdmitCardStructure, DeleteAdmitCardStructure } = require('../controllers/admit-card-structure');


router.get('/admin/:id', GetSingleClassAdmitCardStructure);
router.get('/admin/:id/class/:class/stream/:stream', GetSingleClassAdmitCardStructureByStream);
router.post('/', CreateAdmitCardStructure);
router.put('/', UpdateAdmitCardStructure);
router.delete('/:id', DeleteAdmitCardStructure);
module.exports = router;