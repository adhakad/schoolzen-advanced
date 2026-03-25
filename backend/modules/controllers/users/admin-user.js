'use strict';
const { SMTP_API_KEY, SMTP_HOST, SENDER_EMAIL_ADDRESS } = process.env;
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { nanoid } = require('nanoid');
const tokenService = require('../../services/admin-token');
const AdminUserModel = require('../../models/users/admin-user');
const AdminPlanModel = require('../../models/users/admin-plan');
const SchoolModel = require('../../models/school');
const PaymentModel = require('../../models/payment');
const OTPModel = require('../../models/otp');
const Counter = require('../../models/counter');
const { otpWhatsappMessage } = require('../../services/send-whatsapp-message');
const smtp_host = SMTP_HOST;
const smtp_api_key = SMTP_API_KEY;
const sender_email_address = SENDER_EMAIL_ADDRESS;

const transporter = nodemailer.createTransport({
    host: smtp_host,
    port: 587,
    secure: false,
    auth: {
        user: `apikey`,
        pass: smtp_api_key
    },
});


let LoginAdmin = async (req, res, next) => {
    try {
        let { mobile, password } = req.body;
        let admin = await AdminUserModel.findOne({ mobile: mobile });
        if (!admin) {
            return res.status(404).json({ errorMsg: 'Username or password invalid!' });
        }
        if (!admin.verified) {
            return res.status(400).json({ errorMsg: `Your plan purchase process is incomplete. Please complete the purchase process to enjoy Schooliya's services!` });
        }
        let adminId = admin._id;
        let adminPlan = await AdminPlanModel.findOne({ adminId: adminId });
        if (!adminPlan) {
            return res.status(404).json({ errorMsg: `Your plan purchase process is incomplete. Please complete the purchase process to enjoy Schooliya's services!` });
        }

        if (adminPlan.expiryStatus === true) {
            return res.status(400).json({ errorMsg: `Your ${adminPlan.activePlan} plan has expired. Please purchase your plan to continue enjoying Schooliya's services!` });
        }
        const passwordMatch = await bcrypt.compare(password, admin.password);
        if (!passwordMatch) {
            return res.status(400).json({ errorMsg: 'Username or password invalid!' });
        }
        const payload = { id: admin._id, mobile: admin.mobile };
        const accessToken = await tokenService.getAccessToken(payload);
        const refreshToken = await tokenService.getRefreshToken(payload);
        return res.status(200).json({ adminInfo: admin, accessToken, refreshToken });
    } catch (error) {
        return res.status(500).json({ errorMsg: 'Internal Server Error!' });
    }
}

let RefreshToken = async (req, res, next) => {
    try {
        const { token } = req.body
        if (token) {
            const payload = await tokenService.verifyRefreshToken(token)
            const accessToken = await tokenService.getAccessToken(payload)
            res.send({ accessToken })
        }
        else {
            res.status(403).send('Token unavailable!')
        }
    } catch (err) {
        res.status(500).json(err)
    }
}

// let SignupAdmin = async (req, res, next) => {
//     const stepId = nanoid();
//     const { mobile } = req.body;
//     try {
//         const existingUser = await AdminUserModel.findOne({ mobile });
//         if (existingUser) {
//             if (!existingUser.verified) {
//                 return res.status(400).json({ mobile, adminInfo: existingUser, errorMsg: 'This whatsapp number already register , we are sent to otp on your whatsapp number ,please veryfy your mobile via otp' });
//             }
//             if (existingUser.verified) {
//                 let adminId = existingUser._id;
//                 const existingUserPlan = await AdminPlanModel.findOne({ adminId: adminId });
//                 if (!existingUserPlan) {
//                     return res.status(400).json({ mobile, adminInfo: existingUser, errorMsg: 'This whatsapp number already register and verified,please proceed to your payment' });
//                 }
//                 if (existingUserPlan) {
//                     return res.status(400).json({ errorMsg: `Your ${existingUserPlan.activePlan} plan is already active, enjoy your services!` });
//                 }
//             }

//         }
//         const userData = {
//             mobile,
//             signupStep: 2,
//             otpStep: 2,
//             schoolDetailStep: 1,
//             stepId: stepId
//         };
//         const createUser = await AdminUserModel.create(userData);
//         return res.status(200).json({ successMsg: 'Admin registered successfully', mobile, adminInfo: createUser });
//     } catch (error) {
//         return res.status(500).json({ errorMsg: 'Internal Server Error!' });
//     }
// }

const SignupAdmin = async (req, res, next) => {
    const stepId = nanoid();
    const { mobile } = req.body;

    try {
        const existingUser = await AdminUserModel.findOne({ mobile });

        if (existingUser) {
            const adminId = existingUser._id;

            // User found but not verified
            if (!existingUser.verified) {
                return res.status(400).json({
                    mobile,
                    adminInfo: existingUser,
                    verified: false,
                    infoStaus: true,
                    errorMsg: 'WhatsApp number is already registered. Please verify it using the OTP sent!'
                });
            }

            // User verified — check plan
            const existingUserPlan = await AdminPlanModel.findOne({ adminId });

            if (existingUser.signupStep == 2 && existingUser.otpStep == 3 && existingUser.schoolDetailStep == 2 && existingUser.verified) {
                return res.status(400).json({
                    mobile,
                    adminInfo: existingUser,
                    verified: true,
                    infoStaus: true,
                    errorMsg: 'WhatsApp number already verified. Please fill school details to complete account!'
                });
            }
            if (existingUser.signupStep == 0 && existingUser.otpStep == 0 && existingUser.schoolDetailStep == 0 && existingUser.verified && !existingUserPlan) {
                return res.status(400).json({
                    mobile,
                    adminInfo: existingUser,
                    verified: true,
                    infoStaus: true,
                    errorMsg: 'School details completed. Please proceed with payment to activate account!'
                });
            }

            return res.status(400).json({
                errorStaus: true,
                errorMsg: `Your "${existingUserPlan.activePlan}" plan is already active, enjoy your services!`
            });
        }

        // New registration
        const newUser = await AdminUserModel.create({
            mobile,
            signupStep: 2,
            otpStep: 2,
            schoolDetailStep: 1,
            stepId
        });

        return res.status(200).json({
            successStatus: true,
            successMsg: 'Admin registered successfully. OTP has been sent to your WhatsApp number',
            mobile,
            adminInfo: newUser
        });

    } catch (error) {
        return res.status(500).json({
            errorStaus: true,
            errorMsg: 'Something went wrong on the server. Please try again later!'
        });
    }
};

let UpdateAdminDetail = async (req, res, next) => {
    try {
        const id = req.params.id;
        let {
            name,
            email,
            city,
            state,
            address,
            pinCode,
            schoolName,
            affiliationNumber,
            password
        } = req.body;
        let adminUser = await AdminUserModel.findOne({ _id: id });
        if (!adminUser) {
            return res.status(404).json({ errorMsg: 'Invailid entry!' });
        }
        let schoolAffiliationNumber = await SchoolModel.findOne({ affiliationNumber: affiliationNumber });
        if (schoolAffiliationNumber) {
            return res.status(400).json({ errorMsg: 'School affiliation number already exist!' });
        }

        const existingEmail = await AdminUserModel.findOne({ email: email });
        if (existingEmail) {
            return res.status(400).json({ errorMsg: 'Email already in use by another admin!' });
        }
        const now = new Date();
        const year = now.getFullYear();
        const counter = await Counter.findOneAndUpdate(
            { year },
            { $inc: { schoolIdCount: 1 } },
            { new: true, upsert: true }
        );
        const schoolId = counter.schoolIdCount;
        const hashedPassword = await bcrypt.hash(password, 10);

        let adminDetailData = {
            name,
            email,
            city,
            state,
            address,
            pinCode,
            schoolName,
            affiliationNumber,
            password: hashedPassword,
            schoolId: schoolId,
            schoolDetailStep: 0, signupStep: 0, otpStep: 0

        };
        const updateSchool = await AdminUserModel.findByIdAndUpdate(
            id,
            { $set: adminDetailData },
            { new: true }
        );
        if (updateSchool) {
            return res.status(200).json({ successMsg: 'School updated successfully', adminInfo: updateSchool });
        } else {
            return res.status(404).json('School not found!');
        }
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
};

let ForgotPassword = async (req, res, next) => {
    try {
        const { mobile } = req.body;
        const admin = await AdminUserModel.findOne({ mobile: mobile });
        if (!admin) {
            return res.status(404).json({ errorMsg: 'Whatsapp mobile number not found!' });
        }
        if (!admin.verified) {
            return res.status(400).json({ errorMsg: `Your plan purchase process is incomplete. Please complete the purchase process to enjoy Schooliya's services!` });
        }
        let adminId = admin._id;
        let adminPlan = await AdminPlanModel.findOne({ adminId: adminId });
        if (!adminPlan) {
            return res.status(404).json({ errorMsg: `Your plan purchase process is incomplete. Please complete the purchase process to enjoy Schooliya's services!` });
        }
        if (adminPlan.expiryStatus === true) {
            return res.status(400).json({ errorMsg: `Your ${adminPlan.activePlan} plan has expired. Please purchase your plan to continue enjoying Schooliya's services!` });
        }

        return res.status(200).json({
            successStatus: true,
            successMsg: 'OTP has been sent to your WhatsApp number',
            mobile,
        });

    } catch (error) {
        return res.status(500).json({ errorMsg: 'Internal Server Error!' });
    }
}

let SendWhatsAppOtp = async (req, res, next) => {
    function generateSecureOTP() {
        const otp = crypto.randomInt(100000, 1000000);
        return otp;
    }
    const secureOtp = generateSecureOTP();
    const { mobile } = req.body;

    try {
        if (!mobile) {
            return res.status(400).json({ errorMsg: 'Whatsapp number is required!' });
        }
        const existingUser = await AdminUserModel.findOne({ mobile });
        if (!existingUser) {
            return res.status(404).json({ errorMsg: 'Whatsapp number not register!' });
        }
        let otpDoc = await OTPModel.findOne({ mobile });
        let otpToSend;

        if (otpDoc) {
            const now = Date.now();
            const lastSentTime = otpDoc.lastSentAt.getTime();
            const timeElapsed = (now - lastSentTime);
            const ONE_MINUTE = 60 * 1000;

            if (timeElapsed < ONE_MINUTE) {
                const timeLeft = Math.ceil((ONE_MINUTE - timeElapsed) / 1000);
                return res.status(429).json({
                    errorMsg: `Please wait ${timeLeft} seconds before requesting the OTP again`,
                    cooldownRemaining: timeLeft,
                    mobile: mobile
                });
            }

            otpToSend = otpDoc.secureOtp;
            otpDoc.count = (otpDoc.count || 0) + 1;
            otpDoc.lastSentAt = Date.now();
            await otpDoc.save();

        }
        if (!otpDoc) {
            otpToSend = secureOtp;
            await OTPModel.create({
                mobile,
                secureOtp: otpToSend,
                count: 1,
                lastSentAt: Date.now()
            });
        }
        await otpWhatsappMessage(otpToSend, mobile);

        return res.status(200).json({
            successMsg: 'Your OTP has been successfully sent to WhatsApp',
            mobile: mobile
        });

    } catch (error) {
        return res.status(500).json({ errorMsg: 'Internal server error!' });
    }
}

let VerifyOTP = async (req, res, next) => {
    try {
        const mobile = req.body.mobile;
        if (!mobile) {
            return res.status(404).json({ errorMsg: "Whatsapp number is required!" });
        }
        const userEnteredOTP = parseInt(req.body.otp);
        if (!userEnteredOTP) {
            return res.status(404).json({ errorMsg: "OTP is required!" });
        }
        const user = await AdminUserModel.findOne({ mobile: mobile });
        if (!user) {
            return res.status(404).json({ errorMsg: "Whatsapp number not found!" });
        }
        const otp = await OTPModel.findOne({ mobile: mobile });
        if (!otp) {
            return res.status(404).json({ errorMsg: "Your OTP has expired!" });
        }
        if (userEnteredOTP !== otp.secureOtp) {
            return res.status(400).json({ errorMsg: "Invalid OTP!" });

        }
        if (userEnteredOTP == otp.secureOtp) {
            const objectId = user._id;
            const userData = {
                verified: true,
                signupStep: 2,
                otpStep: 3,
                schoolDetailStep: 2
            };
            let updateUser = await AdminUserModel.findByIdAndUpdate(objectId, { $set: userData }, { new: true });
            if (updateUser) {
                return res.status(200).json({ successMsg: "OTP has been successfully verified", adminInfo: updateUser });
            }
        }
    } catch (err) {
        return res.status(500).json({ errorMsg: "Internal server error!" });
    }
}
let sendEmail = async (email, secureOtp) => {
    const mailOptions = {
        from: {
            name: 'Schooliya',
            address: sender_email_address
        },
        to: email,
        subject: 'Your OTP for Email Verification',
        text: `Your OTP for Schooliya verification is: ${secureOtp}\n\nIf you didn't request this, please ignore this email.`,
        html: `<html><body>
        <div style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px; border-radius: 10px; max-width: 600px; margin: auto;">
            <p style="color: #555; font-size: 16px;">
                We received a request to verify your email address for your Schooliya account. Please use the OTP below to complete your verification:
            </p>
            <p style="font-size: 22px; color: #000; text-align: center; letter-spacing: 2px; margin: 20px 0;">
                <strong>${secureOtp}</strong>
            </p>
            <p style="color: #555; font-size: 16px;">
                If you didn’t request this, please ignore this email.
            </p>
            <p style="color: #555; font-size: 16px;">
                Best regards,<br/>
                The Schooliya Team
            </p>
        </div>
        </body></html>
        `
    };

    try {
        const result = await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error("Failed to send email:", err.message);
    }
};

let ResetPassword = async (req, res, next) => {
    const { mobile, password } = req.body;
    try {
        const user = await AdminUserModel.findOne({ mobile: mobile });
        if (!user) {
            return res.status(404).json({ errorMsg: "Whatsapp number not foud!" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const resetAdminUserInfo = {
            password: hashedPassword,
        }
        const objectId = user._id;
        const updateAdminUser = await AdminUserModel.findByIdAndUpdate(objectId, { $set: resetAdminUserInfo }, { new: true });
        if (updateAdminUser) {
            return res.status(200).json({ successMsg: 'Password reset successfully' });
        }
    } catch (error) {
        return res.status(500).json({ errorMsg: 'Internal Server Error!' });
    }
}
let GetSingleAdminUser = async (req, res, next) => {
    try {
        const singleAdminPlan = await AdminPlanModel.findOne({ adminId: req.params.adminId });
        const objectId = singleAdminPlan.adminId;
        const singleAdminUser = await AdminUserModel.findOne({ _id: objectId });
        return res.status(200).json(singleAdminUser);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}
let GetSingleAdminPlan = async (req, res, next) => {
    try {
        const singleAdminPlan = await AdminPlanModel.findOne({ adminId: req.params.adminId });
        return res.status(200).json(singleAdminPlan);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}
let GetSingleAdminPaymentStepStatus = async (req, res, next) => {
    try {
        const singleAdminUser = await AdminUserModel.findOne({ stepId: req.params.stepId });
        if (!singleAdminUser) {
            return res.status(404).json({ errorMsg: "Not found!" });
        }
        return res.status(200).json({ adminInfo: singleAdminUser });
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    LoginAdmin,
    RefreshToken,
    SignupAdmin,
    ForgotPassword,
    ResetPassword,
    SendWhatsAppOtp,
    VerifyOTP,
    UpdateAdminDetail,
    GetSingleAdminPlan,
    GetSingleAdminUser,
    GetSingleAdminPaymentStepStatus
}