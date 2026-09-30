'use strict';
const express = require('express');
const router = express.Router();

const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const validateRequest = require('../../middleware/validate-request');
const idempotency = require('../../middleware/idempotency');
const { singleUpload, imageFile, imageContentGuard, imageSanitize } = require('../../middleware/single-upload');
const {
    feeQuoteQuerySchema,
    listAdmissionsQuerySchema,
    admissionOverviewQuerySchema,
} = require('../../validators/student/admission.validator');
const {
    GetFeeQuote,
    ListAdmissions,
    GetAdmissionOverview,
    CreateAdmission,
    GetAdmissionLetter,
} = require('../../controllers/student/admission.controller');

// Mounted at /api/v2/student — wiring only, no logic.
const MODULE = 'student';
const scope = assertAdminScope(MODULE);
const photo = [singleUpload(imageFile, 'photo', MODULE), imageContentGuard('photo', MODULE), imageSanitize('photo', MODULE)];

router.get('/admissions', isAdminAuth, scope, validateRequest(listAdmissionsQuerySchema, MODULE, 'query'), ListAdmissions);
router.get('/admissions/fee-quote', isAdminAuth, scope, validateRequest(feeQuoteQuerySchema, MODULE, 'query'), GetFeeQuote);
router.get('/admissions/overview', isAdminAuth, scope, validateRequest(admissionOverviewQuerySchema, MODULE, 'query'), GetAdmissionOverview);
router.post('/admissions', isAdminAuth, photo, scope, idempotency(MODULE), CreateAdmission);
router.get('/admissions/:id/letter', isAdminAuth, scope, GetAdmissionLetter);

module.exports = router;
