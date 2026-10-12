'use strict';
const express = require('express');
const router = express.Router();

const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const requirePermission = require('../../middleware/require-permission');
const validateRequest = require('../../middleware/validate-request');
const v = require('../../validators/examination/examination.validator');
const marksheetStructure = require('../../controllers/examination/marksheet-structure.controller');
const marksheets = require('../../controllers/examination/generate-marksheet.controller');
const admitStructure = require('../../controllers/examination/admit-card-structure.controller');
const admitCards = require('../../controllers/examination/generate-admit-card.controller');

// Mounted at /api/v2/examination — wiring only, no logic and no Mongoose calls.
//
// Explicit Roles & Permissions grants, enforced HERE on the backend, never only by hiding a
// button (every write is also written to the activity log by its controller):
//   'marksheet-structure'   view / set up + remove a class's marksheet structure
//   'marksheet'             view Generate Marksheet, preview, print / enter marks
//   'admit-card-structure'  view / create, edit, delete (each (re)generates admit cards)
//   'admit-card'            view Generate Admit Card, preview, print
//
// No Idempotency-Key anywhere (examination/optimization.md): structure saves are guarded by
// unique indexes + version checks, marks by MARKS_ALREADY_ENTERED, generation by job dedup.
const MODULE = 'examination';
const scoped = [isAdminAuth, assertAdminScope(MODULE)];
const can = (key, action) => [...scoped, requirePermission(key, action)];
const body = (schema) => validateRequest(schema, MODULE);
const query = (schema) => validateRequest(schema, MODULE, 'query');

// Marksheet Structure
router.get('/marksheet-structure', ...can('marksheet-structure', 'view'), query(v.sessionReadSchema), marksheetStructure.GetMarksheetStructures);
router.get('/marksheet-structure/setup', ...can('marksheet-structure', 'view'), query(v.setupQuerySchema), marksheetStructure.GetSetup);
router.put('/marksheet-structure', ...can('marksheet-structure', 'edit'), body(v.setupSaveSchema), marksheetStructure.SaveSetup);
router.delete('/marksheet-structure', ...can('marksheet-structure', 'edit'), query(v.setupRemoveSchema), marksheetStructure.RemoveSetup);

// Generate Marksheet
router.get('/marksheets', ...can('marksheet', 'view'), query(v.marksListSchema), marksheets.ListMarksheets);
router.post('/marksheets/bulk-form', ...can('marksheet', 'edit'), body(v.bulkFormSchema), marksheets.GetBulkForm);
router.post('/marksheets/bulk', ...can('marksheet', 'edit'), body(v.bulkSaveSchema), marksheets.SaveBulkMarks);
router.post('/marksheets/print', ...can('marksheet', 'view'), body(v.marksPrintSchema), marksheets.PrintMarksheets);
router.get('/marksheets/:studentId/form', ...can('marksheet', 'view'), query(v.marksFormSchema), marksheets.GetMarksForm);
router.put('/marksheets/:studentId', ...can('marksheet', 'edit'), body(v.marksSaveSchema), marksheets.SaveMarks);

// Admit Card Structure
router.get('/admit-card-structures', ...can('admit-card-structure', 'view'), query(v.structureListSchema), admitStructure.ListStructures);
router.get('/admit-card-structures/options', ...can('admit-card-structure', 'view'), query(v.optionsSchema), admitStructure.GetOptions);
router.get('/admit-card-structures/:id', ...can('admit-card-structure', 'view'), query(v.readSchema), admitStructure.GetStructure);
router.post('/admit-card-structures', ...can('admit-card-structure', 'edit'), body(v.structureCreateSchema), admitStructure.CreateStructure);
router.put('/admit-card-structures/:id', ...can('admit-card-structure', 'edit'), body(v.structureUpdateSchema), admitStructure.UpdateStructure);
router.delete('/admit-card-structures/:id', ...can('admit-card-structure', 'edit'), query(v.readSchema), admitStructure.DeleteStructure);
router.get('/jobs/:jobId', ...can('admit-card-structure', 'view'), query(v.readSchema), admitStructure.GetJobStatus);

// Generate Admit Card
router.get('/admit-cards', ...can('admit-card', 'view'), query(v.cardListSchema), admitCards.ListAdmitCards);
router.post('/admit-cards/print', ...can('admit-card', 'view'), body(v.cardPrintSchema), admitCards.PrintAdmitCards);

module.exports = router;
