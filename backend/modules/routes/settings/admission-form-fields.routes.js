'use strict';
const express = require('express');
const router = express.Router();

const validateRequest = require('../../middleware/validate-request');
const { canView, canEdit } = require('../../helpers/settings/route-guards');
const {
    listQuerySchema, createFieldSchema, saveChangesSchema, impactSchema,
} = require('../../validators/settings/admission-form-fields.validator');
const {
    GetFieldConfig, GetFieldImpact, CreateField, SaveFieldChanges, DeleteField,
} = require('../../controllers/settings/admission-form-fields.controller');

// Mounted at /api/v2/settings — wiring only, no logic.
router.get('/admission-form-fields', ...canView, validateRequest(listQuerySchema, 'settings', 'query'), GetFieldConfig);
router.post('/admission-form-fields', ...canEdit, validateRequest(createFieldSchema, 'settings'), CreateField);
router.put('/admission-form-fields', ...canEdit, validateRequest(saveChangesSchema, 'settings'), SaveFieldChanges);
// POST, not GET: the pending options list is a body. Read-only — view permission is enough.
router.post(
    '/admission-form-fields/:fieldKey/impact',
    ...canView,
    validateRequest(impactSchema, 'settings'),
    GetFieldImpact
);
router.delete('/admission-form-fields/:fieldKey', ...canEdit, DeleteField);

module.exports = router;
