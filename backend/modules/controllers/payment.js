'use strict';
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { DateTime } = require('luxon');
const Payment = require('../models/payment');
const AdminPlan = require('../models/users/admin-plan');
const WhatsappMessageWallet = require('../models/whatsapp-message/message-wallet');
const Invoice = require('../models/invoice');
const Counter = require('../models/counter');
const tokenService = require('../services/admin-token');
const { sendPlanPaymentConfirmationMessage } = require('../services/send-whatsapp-message');
const { KEY_ID, KEY_SECRET, CLOUDINARY_CLOUD_NAMAE } = process.env;
const key_id = KEY_ID;
const key_secret = KEY_SECRET;

const razorpay = new Razorpay({
  key_id: key_id,
  key_secret: key_secret,
});


let CreatePayment = async (req, res) => {
  const { adminId, activePlan, amount, currency } = req.body;
  const paymentData = {
    amount: amount * 100,
    currency: currency,
  };
  try {
    const order = await razorpay.orders.create(paymentData);
    const payment = new Payment({
      adminId: adminId,
      activePlan: activePlan,
      orderId: order.id,
      amount: amount,
      currency,
    });
    await payment.save();
    res.status(200).json({ order });
  } catch (error) {
    res.status(500).json({ errorMsg: 'Payment creation failed!' });
  }
};

let ValidatePayment = async (req, res) => {
  const {
    payment_id: paymentId,
    order_id: orderId,
    signature,
    name,
    mobile,
    id,
    activePlan,
    subscriptionType,
    amount,
    currency,
    studentLimit,
    teacherLimit,
    whatsappMessageLimit
  } = req.body;

  const adminInfo = { id, mobile, activePlan, amount, currency };
  let paymentInfo = { paymentId, orderId, adminId: id, activePlan, amount, currency, status: 'success' };
  const body = `${orderId}|${paymentId}`;

  try {
    // 🔐 verify Razorpay signature
    const expectedSignature = crypto.createHmac("sha256", key_secret).update(body).digest("hex");
    if (expectedSignature !== signature) {
      return res.status(400).json({ errorMsg: 'Invalid signature!' });
    }

    // 💾 save payment
    const newPayment = await Payment.create(paymentInfo);

    // 📅 prepare date & invoice
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const paymentDate = `${day}/${month}/${year}`;
    const datePrefix = `SCH${year}${month}${day}`;
    const counter = await Counter.findOneAndUpdate(
      { year },
      { $inc: { count: 1 } },
      { new: true, upsert: true }
    );
    const invoiceNumber = `${datePrefix}${counter.count}`;

    paymentInfo.invoiceNumber = invoiceNumber;
    const newInvoice = await Invoice.create(paymentInfo);

    // ⏳ set plan expiry
    let expirationDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    // 💬 setup whatsapp wallet
    let whatsappMessageData = {
      adminId: id,
      totalWhatsappMessage: whatsappMessageLimit,
      remainingWhatsappMessage: whatsappMessageLimit
    };
    const updatedAdminPlan = await AdminPlan.findOneAndUpdate(
      { adminId: id },
      {
        $set: {
          activePlan,
          subscriptionType,
          amount,
          currency,
          studentLimit,
          teacherLimit,
          paymentStatus: true,
          expirationDate,
          expiryStatus: false,
        }
      },
      { upsert: true, new: true }
    );

    const createWhatsappMessage = await WhatsappMessageWallet.create(whatsappMessageData);

    if (!updatedAdminPlan) {
      return res.status(400).json({ errorMsg: 'Failed to create or update admin plan!' });
    }

    // 🎯 New Subscription transaction type
    const transactionType = 'New Subscription';

    // 🟢 Generate tokens
    const payload = { id, mobile };
    const accessToken = await tokenService.getAccessToken(payload);
    const refreshToken = await tokenService.getRefreshToken(payload);

    // ✅ Prepare WhatsApp message values
    const phone = mobile;
    const transaction_message = "Thank you for subscribing to Schooliya! Your account is now active.";
    const invoice_number = invoiceNumber;
    const payment_date = paymentDate;
    const plan_type = activePlan;

    // 📩 Send WhatsApp confirmation
    sendPlanPaymentConfirmationMessage(
      phone,
      name,
      transaction_message,
      invoice_number,
      payment_date,
      amount,
      plan_type,
      transactionType,
      paymentId
    );

    return res.status(200).json({
      success: true,
      accessToken,
      refreshToken,
      adminInfo,
      successMsg: 'Payment successfully Received'
    });

  } catch (error) {
    console.error("ValidatePayment error:", error);
    return res.status(500).json({ errorMsg: 'Error validating payment!' });
  }
};



let ValidateUpgradePlanPayment = async (req, res) => {
  const { payment_id: paymentId, order_id: orderId, signature, email, id, activePlan, amount, currency, studentLimit, teacherLimit } = req.body;
  const adminInfo = { id, email, activePlan, amount, currency };
  let paymentInfo = { paymentId, orderId, adminId: id, activePlan, amount, currency, status: 'success' };
  const body = `${orderId}|${paymentId}`;

  try {
    const expectedSignature = crypto.createHmac("sha256", key_secret).update(body).digest("hex");
    if (expectedSignature !== signature) {
      return res.status(400).json({ errorMsg: 'Invailid signature!' });
    }

    const newPayment = await Payment.create(paymentInfo);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const paymentDate = `${day}/${month}/${year}`
    const datePrefix = `SCH${year}${month}${day}`;
    const counter = await Counter.findOneAndUpdate(
      { year },
      { $inc: { count: 1 } },
      { new: true, upsert: true }
    );
    const invoiceNumber = `${datePrefix}${counter.count}`;
    paymentInfo.invoiceNumber = invoiceNumber;
    const newInvoice = await Invoice.create(paymentInfo);
    const updatedAdminPlan = await AdminPlan.findOneAndUpdate(
      { adminId: id },
      {
        $set: {
          activePlan,
          amount,
          currency,
          studentLimit,
          teacherLimit,
          paymentStatus: true,
          updatedAt: Date.now(),
        }
      },
      { upsert: true, new: true }
    );

    if (!updatedAdminPlan) {
      return res.status(400).json({ errorMsg: 'Failed to create or update admin plan!' });
    }
    const transactionType = 'Upgrade';
    // sendEmail(email, invoiceNumber, amount, activePlan, paymentDate, transactionType);
    const payload = { id, email };
    const accessToken = await tokenService.getAccessToken(payload);
    const refreshToken = await tokenService.getRefreshToken(payload);

    return res.status(200).json({ success: true, accessToken, refreshToken, adminInfo, successMsg: 'Payment successfully Received' });
  } catch (error) {
    return res.status(500).json({ errorMsg: 'Error validating payment!' });
  }
};

async function sendEmail(email, invoiceNumber, amount, activePlan, paymentDate, transactionType) {
  const messages = {
    "New Subscription": "Thank you for subscribing to Schooliya. Your account is now active.",
    "Upgrade": "Your plan has been upgraded. Enjoy the new features!",
    "Renewal": "Your subscription has been renewed. You can continue using Schooliya without interruption."
  };
  const mailOptions = {
    from: { name: 'Schooliya', address: sender_email_address },
    to: email,
    subject: 'Payment Confirmation & Invoice from Schooliya',
    text: `Dear User,Thank you for your payment. This is a confirmation that your transaction has been successfully processed.If you have any questions, feel free to contact us.Best regards,The Schooliya Team`,
    html: `<html><body>
      <div style="font-family: Arial, sans-serif; background-color: #f3f4f6; padding: 10px;">
        <div style="max-width: 600px; margin: auto; background-color: #ffffff; padding: 30px 18px; border-radius: 10px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
          <div style="text-align: left; margin-bottom: 20px;">
            <img 
              src="https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAMAE}/image/upload/v1731663497/logo_muu7zu.png" 
              alt="Schooliya Logo" 
              style="height: 32px; display: inline-block;" 
            />
          </div>
          <hr style="border: 0; height: 1px; background: #ddd; margin: 20px 0;">
          
          <p style="color: #555; font-size: 14px;">Hello Dear,</p>
          <p style="color: #555; font-size: 14px; line-height: 1.6;">${messages[transactionType] || "Your payment has been received successfully."}</p>

          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-top: 20px; border: 1px solid #e3e5e8;">
            <h3 style="color: #333; margin: 0; font-size: 18px;">Invoice Summary</h3>
            <table style="width: 100%; font-size: 14px; color: #333; margin-top: 10px; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #ddd;">Invoice No.:</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #ddd; text-align: right;">${invoiceNumber}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #ddd;">Payment Date:</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #ddd; text-align: right;">${paymentDate}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #ddd;">Amount Paid:</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #ddd; text-align: right;">₹${amount}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #ddd;">Plan Type:</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #ddd; text-align: right;">${activePlan}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #ddd;">Transaction Type:</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #ddd; text-align: right;">${transactionType}</td>
              </tr>
            </table>
          </div>

          <p style="color: #555; font-size: 14px; line-height: 1.6; margin-top: 20px;">
            Thank you for choosing Schooliya! If you have any questions, please feel free to reach out to us at 
            <br>
            <a href="mailto:info@schooliya.in" style="color: #333; text-decoration: none;">info@schooliya.in</a>
          </p>
          
          <p style="color: #555; font-size: 14px; margin-top: 30px; text-align: center;">Copyright &copy; Schooliya, All rights reserved.<br>
          </p>
        </div>
      </div>
      </body></html>
    `
  };
  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Failed to send email:", error.message);
  }
}

module.exports = {
  CreatePayment,
  ValidatePayment,
  ValidateUpgradePlanPayment
}