'use strict';
const express = require('express');
const router = express.Router();

const validateRequest = require('../../middleware/validate-request');
const { canView, canEdit } = require('../../helpers/settings/route-guards');
const {
    createRoleSchema, updateRoleSchema, matrixQuerySchema,
    createAssignmentSchema, updateAssignmentSchema, bulkDeleteAssignmentsSchema,
} = require('../../validators/settings/roles-permissions.validator');
const {
    GetRoles, CreateRole, UpdateRole, DeleteRole,
    GetMatrix, GetClassOptions, CreateAssignment, UpdateAssignment, DeleteAssignment, BulkDeleteAssignments,
} = require('../../controllers/settings/roles-permissions.controller');

// Mounted at /api/v2/settings — wiring only, no logic.

// Step 1 — roles
router.get('/roles', ...canView, GetRoles);
router.post('/roles', ...canEdit, validateRequest(createRoleSchema, 'settings'), CreateRole);
router.put('/roles/:id', ...canEdit, validateRequest(updateRoleSchema, 'settings'), UpdateRole);
router.delete('/roles/:id', ...canEdit, DeleteRole);

// Step 2 — who holds which role, for which class
router.get('/role-assignments/matrix', ...canView, validateRequest(matrixQuerySchema, 'settings', 'query'), GetMatrix);
router.get('/role-assignments/class-options', ...canView, GetClassOptions);
router.post('/role-assignments/bulk-delete', ...canEdit, validateRequest(bulkDeleteAssignmentsSchema, 'settings'), BulkDeleteAssignments);
router.post('/role-assignments', ...canEdit, validateRequest(createAssignmentSchema, 'settings'), CreateAssignment);
router.put('/role-assignments/:id', ...canEdit, validateRequest(updateAssignmentSchema, 'settings'), UpdateAssignment);
router.delete('/role-assignments/:id', ...canEdit, DeleteAssignment);

module.exports = router;
