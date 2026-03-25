'use strict';
const express = require('express');
const router = express.Router();
const { GetSingleClassMarksheetTemplateByStream, GetSingleClassMarksheetTemplateStructureByStream, GetSingleMarksheetTemplateById, CreateExamResultStructure, UpdateMarksheetTemplateStructure, DeleteResultStructure } = require('../controllers/exam-result-structure');

router.post('/', CreateExamResultStructure);
router.get('/admin/:id/class/:class/stream/:stream', GetSingleClassMarksheetTemplateByStream);
router.get('/admin/:id/template/structure/class/:class/stream/:stream', GetSingleClassMarksheetTemplateStructureByStream);
router.get('/admin/template/structure/:id', GetSingleMarksheetTemplateById);
router.put('/template/structure/:id', UpdateMarksheetTemplateStructure);
router.delete('/:id', DeleteResultStructure);

module.exports = router;