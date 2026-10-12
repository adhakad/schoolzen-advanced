'use strict';
const express = require('express');
const router = express.Router();

const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const requirePermission = require('../../middleware/require-permission');
const validateRequest = require('../../middleware/validate-request');
const idempotency = require('../../middleware/idempotency');
const v = require('../../validators/certificates/certificates.validator');
const structure = require('../../controllers/certificates/tc-structure.controller');
const tc = require('../../controllers/certificates/transfer-certificate.controller');

// Mounted at /api/v2/certificates — wiring only, no logic and no Mongoose calls.
//
// Explicit Roles & Permissions grants, enforced HERE on the backend, never only by hiding a
// button (every write is also written to the activity log by its controller):
//   'certificates'  view TC Structure and Generate TC, reprint issued TCs
//   'tc-structure'  edit the next TC serial number
//   'tc-generate'   issue and cancel transfer certificates
// Pending fees additionally need 'fees-waiver' to override (controller).
//
// Idempotency-Key on Issue TC (certificates/optimization.md).
const MODULE = 'certificates';
const scoped = [isAdminAuth, assertAdminScope(MODULE)];
const view = [...scoped, requirePermission('certificates', 'view')];
const structureEdit = [...scoped, requirePermission('tc-structure', 'edit')];
const generate = [...scoped, requirePermission('tc-generate', 'edit')];
const body = (schema) => validateRequest(schema, MODULE);
const query = (schema) => validateRequest(schema, MODULE, 'query');

// TC Structure
router.get('/tc-structure', ...view, query(v.structureReadSchema), structure.GetTcStructure);
router.put('/tc-structure', ...structureEdit, body(v.structureUpdateSchema), structure.UpdateTcStructure);

// Generate TC
router.get('/tc/students', ...view, query(v.listSchema), tc.ListStudents);
router.get('/tc/students/:studentId/draft', ...view, query(v.draftSchema), tc.GetIssueDraft);
router.post('/tc/students/:studentId/issue', ...generate, body(v.issueSchema), idempotency(MODULE), tc.IssueTc);
router.get('/tc/:id', ...view, query(v.readSchema), tc.GetTc);
router.post('/tc/:id/cancel', ...generate, body(v.cancelSchema), tc.CancelTc);

module.exports = router;
