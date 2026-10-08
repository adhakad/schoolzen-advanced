'use strict';
const express = require('express');
const router = express.Router();

const validateRequest = require('../../middleware/validate-request');
const { canView, canEdit } = require('../../helpers/settings/route-guards');
const { previewQuerySchema, assignSchema } = require('../../validators/settings/marksheet-templates.validator');
const { GetTemplates, GetAssignPreview, AssignTemplate } = require('../../controllers/settings/marksheet-templates.controller');

// Mounted at /api/v2/settings — wiring only, no logic.
router.get('/marksheet-templates', ...canView, GetTemplates);
router.get(
    '/marksheet-templates/assign-preview',
    ...canView,
    validateRequest(previewQuerySchema, 'settings', 'query'),
    GetAssignPreview
);
router.post('/marksheet-templates/assign', ...canEdit, validateRequest(assignSchema, 'settings'), AssignTemplate);

module.exports = router;
