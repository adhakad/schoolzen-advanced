'use strict';
const express = require('express');
const router = express.Router();
const { GetSingleClassFeesStructure,GetSingleSessionFeesStructure,GetSingleClassFeesStructureByStream, CreateFeesStructure, DeleteFeesStructure } = require('../controllers/fees-structure');

router.post('/', CreateFeesStructure);
router.get('/admin/:id', GetSingleClassFeesStructure);
router.get('/admin/:id/session/:session', GetSingleSessionFeesStructure);
router.get('/admin/:id/class/:class/stream/:stream', GetSingleClassFeesStructureByStream);
router.delete('/:id', DeleteFeesStructure)

module.exports = router;