'use strict';
const express = require('express');
const router = express.Router();

const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const requirePermission = require('../../middleware/require-permission');
const validateRequest = require('../../middleware/validate-request');
const { singleUpload, logoFile, imageContentGuard } = require('../../middleware/single-upload');
const { saveSchoolProfileSchema } = require('../../validators/settings/school-profile.validator');
const { GetSchoolProfile, SaveSchoolProfile } = require('../../controllers/settings/school-profile.controller');

// Mounted at /api/v2/settings — wiring only, no logic. Own permission key
// 'settings-school-profile' (school-profile.md), not the page-wide 'settings' grant.
// adminId travels in the query string: the PUT may be multipart, and Multer replaces req.body.
const base = [isAdminAuth, assertAdminScope('settings')];

router.get('/school-profile', ...base, requirePermission('settings-school-profile', 'view'), GetSchoolProfile);
router.put(
    '/school-profile',
    ...base,
    requirePermission('settings-school-profile', 'edit'),
    singleUpload(logoFile, 'logo', 'settings'),
    imageContentGuard('logo', 'settings'),
    validateRequest(saveSchoolProfileSchema, 'settings'),
    SaveSchoolProfile
);

module.exports = router;
