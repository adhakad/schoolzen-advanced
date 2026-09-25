'use strict';
const express = require('express');
const router = express.Router();

const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const validateRequest = require('../../middleware/validate-request');
const {
    createSubjectGroupSchema,
    updateSubjectGroupSchema,
    bulkDeleteSubjectGroupsSchema,
} = require('../../validators/academic-setup/subject-groups.validator');
const {
    GetSubjectGroups,
    GetFormOptions,
    CreateSubjectGroup,
    UpdateSubjectGroup,
    BulkDeleteSubjectGroups,
} = require('../../controllers/academic-setup/subject-groups.controller');

// Mounted at /api/v2/academic-setup — wiring only, no logic and no Mongoose calls.
const scope = assertAdminScope('academic-setup');

router.get('/subject-groups', isAdminAuth, scope, GetSubjectGroups);

// Both the toolbar's Class/Stream filters and the modal's class/stream/subject inputs come
// from this one call, so the page never stitches two responses together.
router.get('/subject-groups/form-options', isAdminAuth, scope, GetFormOptions);

router.post(
    '/subject-groups',
    isAdminAuth,
    scope,
    validateRequest(createSubjectGroupSchema, 'academic-setup'),
    CreateSubjectGroup
);
router.put(
    '/subject-groups/:id',
    isAdminAuth,
    scope,
    validateRequest(updateSubjectGroupSchema, 'academic-setup'),
    UpdateSubjectGroup
);
router.post(
    '/subject-groups/bulk-delete',
    isAdminAuth,
    scope,
    validateRequest(bulkDeleteSubjectGroupsSchema, 'academic-setup'),
    BulkDeleteSubjectGroups
);

module.exports = router;
