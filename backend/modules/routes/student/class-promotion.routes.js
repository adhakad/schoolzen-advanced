'use strict';
const express = require('express');
const router = express.Router();

const { isAdminAuth } = require('../../middleware/admin-auth');
const assertAdminScope = require('../../middleware/assert-admin-scope');
const validateRequest = require('../../middleware/validate-request');
const { rosterQuerySchema, decisionsSchema } = require('../../validators/student/class-promotion.validator');
const {
    GetPromotionRoster,
    PreviewPromotion,
    ConfirmPromotion,
} = require('../../controllers/student/class-promotion.controller');

// Mounted at /api/v2/student — wiring only, no logic.
const MODULE = 'student';
const scope = assertAdminScope(MODULE);

router.get('/promotion/roster', isAdminAuth, scope, validateRequest(rosterQuerySchema, MODULE, 'query'), GetPromotionRoster);
router.post('/promotion/preview', isAdminAuth, scope, validateRequest(decisionsSchema, MODULE), PreviewPromotion);
// No Idempotency-Key: the promotion job's own dedup key (its inputs' hash) already makes a
// repeated confirm a no-op (database-design-principles.md, queued-job idempotency).
router.post('/promotion/confirm', isAdminAuth, scope, validateRequest(decisionsSchema, MODULE), ConfirmPromotion);

module.exports = router;
