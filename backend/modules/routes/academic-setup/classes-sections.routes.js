'use strict';
const express = require('express');
const router = express.Router();

const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const validateRequest = require('../../middleware/validate-request');
const idempotency = require('../../middleware/idempotency');
const {
    createClassSchema,
    updateClassSchema,
    bulkDeleteClassesSchema,
} = require('../../validators/academic-setup/classes-sections.validator');
const {
    GetClasses,
    GetClassNameOptions,
    CreateClass,
    UpdateClass,
    DeleteClass,
    BulkDeleteClasses,
} = require('../../controllers/academic-setup/classes-sections.controller');

// Mounted at /api/v2/academic-setup — wiring only, no logic and no Mongoose calls.
//
// Unlike the legacy routes, these require a real admin session: isAdminAuth verifies the
// bearer token AdminAuthInterceptor already attaches, and assertAdminScope checks the
// adminId in the request against that token.
const scope = assertAdminScope('academic-setup');
// Double-submit backstop on Add/Edit (academic-setup-critical-fixes.md P1-10): the shared
// Idempotency-Key middleware, after scope so the key is per school.
const idem = idempotency('academic-setup');

router.get('/classes', isAdminAuth, scope, GetClasses);
router.get('/class-options', isAdminAuth, scope, GetClassNameOptions);
router.post('/classes', isAdminAuth, scope, idem, validateRequest(createClassSchema, 'academic-setup'), CreateClass);
router.put('/classes/:id', isAdminAuth, scope, idem, validateRequest(updateClassSchema, 'academic-setup'), UpdateClass);
router.delete('/classes/:id', isAdminAuth, scope, DeleteClass);

// POST, not DELETE: the selection is a body (an array of ids plus the confirmation
// flag), and a DELETE with a body is awkward through both HttpClient and proxies.
router.post(
    '/classes/bulk-delete',
    isAdminAuth,
    scope,
    validateRequest(bulkDeleteClassesSchema, 'academic-setup'),
    BulkDeleteClasses
);

module.exports = router;
