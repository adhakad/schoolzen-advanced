'use strict';
const express = require('express');
const router = express.Router();

const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const validateRequest = require('../../middleware/validate-request');
const {
    createSubjectSchema,
    updateSubjectSchema,
    bulkDeleteSubjectsSchema,
} = require('../../validators/academic-setup/subjects.validator');
const {
    GetSubjects,
    CreateSubject,
    UpdateSubject,
    BulkDeleteSubjects,
} = require('../../controllers/academic-setup/subjects.controller');

// Mounted at /api/v2/academic-setup — wiring only, no logic and no Mongoose calls.
const scope = assertAdminScope('academic-setup');

router.get('/subjects', isAdminAuth, scope, GetSubjects);
router.post('/subjects', isAdminAuth, scope, validateRequest(createSubjectSchema, 'academic-setup'), CreateSubject);
router.put('/subjects/:id', isAdminAuth, scope, validateRequest(updateSubjectSchema, 'academic-setup'), UpdateSubject);

// POST, not DELETE: the selection is a body (an array of ids plus the confirmation flag),
// and a DELETE with a body is awkward through both HttpClient and proxies.
router.post(
    '/subjects/bulk-delete',
    isAdminAuth,
    scope,
    validateRequest(bulkDeleteSubjectsSchema, 'academic-setup'),
    BulkDeleteSubjects
);

module.exports = router;
