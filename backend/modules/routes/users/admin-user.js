'use strict';
const express = require('express');
const router = express.Router();
const { LoginAdmin, RefreshToken, SignupAdmin, ForgotPassword, VerifyOTP, SendWhatsAppOtp, ResetPassword, UpdateAdminDetail, GetSingleAdminPlan, GetSingleAdminUser, GetSingleAdminPaymentStepStatus, GetAdminDirectoryForSales } = require('../../controllers/users/admin-user');
const { isSalesAuth } = require('../../middleware/sales-auth');

router.post('/login', LoginAdmin);
router.post('/refresh', RefreshToken);
router.post('/signup', SignupAdmin);
router.post('/forgot-password', ForgotPassword);
router.post('/varify-otp', VerifyOTP);
router.post('/send-whatsapp-otp', SendWhatsAppOtp);
router.post('/reset-password', ResetPassword);
router.get('/admin-user/:adminId', GetSingleAdminUser);
router.get('/admin-user/step/:stepId', GetSingleAdminPaymentStepStatus);
router.get('/admin-plan/:adminId', GetSingleAdminPlan);
router.put('/admin-detail/:id', UpdateAdminDetail)
// Sales-only — never reachable from the admin dashboard.
router.get('/admin-directory', isSalesAuth, GetAdminDirectoryForSales);

module.exports = router;