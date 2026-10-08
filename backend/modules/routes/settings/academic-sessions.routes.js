'use strict';
const express = require('express');
const router = express.Router();

const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const validateRequest = require('../../middleware/validate-request');
const { canView, canEdit } = require('../../helpers/settings/route-guards');
const {
    listSessionsQuerySchema,
    createSessionSchema,
    activateSessionSchema,
} = require('../../validators/settings/academic-sessions.validator');
const {
    GetSessions,
    GetSessionOptions,
    GetActiveSession,
    GetCopyForwardOptions,
    CreateSession,
    ActivateSession,
    DeleteSession,
} = require('../../controllers/settings/academic-sessions.controller');

// Mounted at /api/v2/settings — wiring only, no logic.
//
// The two school-wide reads (the shell's session selector and "the active session") need
// only a verified token for this school, not Settings' own permission: every person in the
// school must know which year they're working in. Everything else is the Settings page.
const schoolWide = [isAdminAuth, assertAdminScope('settings')];

router.get('/academic-sessions/options', ...schoolWide, GetSessionOptions);
router.get('/academic-sessions/active', ...schoolWide, GetActiveSession);

router.get('/academic-sessions/copy-forward-options', ...canView, GetCopyForwardOptions);
router.get('/academic-sessions', ...canView, validateRequest(listSessionsQuerySchema, 'settings', 'query'), GetSessions);
router.post('/academic-sessions', ...canEdit, validateRequest(createSessionSchema, 'settings'), CreateSession);
router.post(
    '/academic-sessions/:id/activate',
    ...canEdit,
    validateRequest(activateSessionSchema, 'settings'),
    ActivateSession
);
router.delete('/academic-sessions/:id', ...canEdit, DeleteSession);

module.exports = router;
