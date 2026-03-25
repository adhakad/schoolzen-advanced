'use strict';
const axios = require('axios').default;
const { MSG91_AUTH_KEY, MSG91_INTEGRATED_NUMBER, MSG91_NAMESPACE, MSG91_LOGIN_OTP, MSG91_PLAN_PAYMENT_CONFIRMATION, MSG91_ID_CARD_ORDER, MSG91_FEE_CONFIRMATION, MSG91_FEE_REMINDER } = process.env;

const sendOtpWhatsappMessage = async (otp, phone) => {
    try {
        const payload = {
            integrated_number: MSG91_INTEGRATED_NUMBER,
            content_type: "template",
            payload: {
                messaging_product: "whatsapp",
                type: "template",
                template: {
                    name: MSG91_LOGIN_OTP,
                    language: {
                        code: "en_GB",
                        policy: "deterministic"
                    },
                    namespace: MSG91_NAMESPACE,
                    to_and_components: [
                        {
                            to: [`91${phone}`],
                            components: {
                                body_1: {
                                    type: "text",
                                    value: otp
                                },
                                button_1: {
                                    subtype: "url",
                                    type: "text",
                                    value: otp
                                }
                            }
                        }
                    ]
                }
            }
        };

        const headers = {
            authkey: MSG91_AUTH_KEY,
            'Content-Type': 'application/json',
            Accept: 'application/json'
        };

        const response = await axios.post(
            'https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/',
            payload,
            { headers }
        );

        return response.data;
    } catch (error) {
        console.error('MSG91 WhatsApp Error:', error.response?.data || error.message);
        throw new Error('WhatsApp OTP not sent');
    }
};

const sendPlanPaymentConfirmation = async (phone, user_name, transaction_message, invoice_number, payment_date, amount, plan_type, transaction_type, payment_id) => {
    try {
        const payload = {
            integrated_number: process.env.MSG91_INTEGRATED_NUMBER,
            content_type: "template",
            payload: {
                messaging_product: "whatsapp",
                type: "template",
                template: {
                    name: MSG91_PLAN_PAYMENT_CONFIRMATION,
                    language: {
                        code: "en",
                        policy: "deterministic"
                    },
                    namespace: MSG91_NAMESPACE,
                    to_and_components: [
                        {
                            to: [`91${phone}`],
                            components: {
                                body_1: {
                                    type: "text",
                                    value: user_name,
                                },
                                body_2: {
                                    type: "text",
                                    value: transaction_message,
                                },
                                body_3: {
                                    type: "text",
                                    value: invoice_number,
                                },
                                body_4: {
                                    type: "text",
                                    value: payment_date,
                                },
                                body_5: {
                                    type: "text",
                                    value: amount,
                                },
                                body_6: {
                                    type: "text",
                                    value: plan_type,
                                },
                                body_7: {
                                    type: "text",
                                    value: transaction_type,
                                },
                                body_8: {
                                    type: "text",
                                    value: payment_id,
                                },
                            },
                        },
                    ],
                },
            },
        };

        const headers = {
            authkey: process.env.MSG91_AUTH_KEY,
            "Content-Type": "application/json",
            Accept: "application/json",
        };

        const response = await axios.post(
            "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
            payload,
            { headers }
        );

        const requestId = response.data.request_id;
        const sentDateTime = response.headers.date;
        return { requestId, sentDateTime };
    } catch (error) {
        console.error("MSG91 WhatsApp Error:", error.response?.data || error.message);
        throw new Error("WhatsApp message not sent");
    }
};


const sendFeesConfirmationWithoutReceipt = async (phone, school_name, academic_year, student_name, received_amount, date, receipt_no, class_name, admission_no, father_name, mother_name) => {
    try {
        const payload = {
            integrated_number: process.env.MSG91_INTEGRATED_NUMBER,
            content_type: "template",
            payload: {
                messaging_product: "whatsapp",
                type: "template",
                template: {
                    name: MSG91_FEE_CONFIRMATION,
                    language: {
                        code: "en",
                        policy: "deterministic"
                    },
                    namespace: MSG91_NAMESPACE,

                    to_and_components: [
                        {
                            to: [`91${phone}`],
                            "components": {
                                "body_1": {
                                    "type": "text",
                                    "value": school_name
                                },
                                "body_2": {
                                    "type": "text",
                                    "value": academic_year
                                },
                                "body_3": {
                                    "type": "text",
                                    "value": student_name
                                },
                                "body_4": {
                                    "type": "text",
                                    "value": received_amount
                                },
                                "body_5": {
                                    "type": "text",
                                    "value": date
                                },
                                "body_6": {
                                    "type": "text",
                                    "value": receipt_no
                                },
                                "body_7": {
                                    "type": "text",
                                    "value": class_name
                                },
                                "body_8": {
                                    "type": "text",
                                    "value": admission_no
                                },
                                "body_9": {
                                    "type": "text",
                                    "value": father_name
                                },
                                "body_10": {
                                    "type": "text",
                                    "value": mother_name
                                },
                            }
                        }
                    ]
                }
            }
        };

        const headers = {
            authkey: process.env.MSG91_AUTH_KEY,
            'Content-Type': 'application/json',
            Accept: 'application/json'
        };

        const response = await axios.post(
            'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/',
            payload,
            { headers }
        );

        const requestId = response.data.request_id;
        const sentDateTime = response.headers.date;
        return { requestId, sentDateTime };
    } catch (error) {
        console.error('MSG91 WhatsApp Error:', error.response?.data || error.message);
        throw new Error('WhatsApp message not sent');
    }
};


const sendManualFeeReminderMessage = async (phone, school_name, father_name, pending_amount, student_name, class_name, last_date) => {
    try {
        const payload = {
            integrated_number: process.env.MSG91_INTEGRATED_NUMBER,
            content_type: "template",
            payload: {
                messaging_product: "whatsapp",
                type: "template",
                template: {
                    name: MSG91_FEE_REMINDER,
                    language: {
                        code: "en",
                        policy: "deterministic"
                    },
                    namespace: MSG91_NAMESPACE,
                    to_and_components: [
                        {
                            to: [`91${phone}`],
                            "components": {
                                "body_1": {
                                    "type": "text",
                                    "value": school_name
                                },
                                "body_2": {
                                    "type": "text",
                                    "value": father_name
                                },
                                "body_3": {
                                    "type": "text",
                                    "value": pending_amount
                                },
                                "body_4": {
                                    "type": "text",
                                    "value": student_name
                                },
                                "body_5": {
                                    "type": "text",
                                    "value": class_name
                                },
                                "body_6": {
                                    "type": "text",
                                    "value": last_date
                                },
                            }
                        }
                    ]
                }
            }
        };

        const headers = {
            authkey: process.env.MSG91_AUTH_KEY,
            'Content-Type': 'application/json',
            Accept: 'application/json'
        };

        const response = await axios.post(
            'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/',
            payload,
            { headers }
        );
        const requestId = response.data.request_id;
        const sentDateTime = response.headers.date;
        return { requestId, sentDateTime };
    } catch (error) {
        console.error('MSG91 WhatsApp Error:', error.response?.data || error.message);
        throw new Error('WhatsApp message not sent');
    }
};

const sendIdCardOrder = async (phone, school_name, mobile_number, order_date) => {
    try {
        const payload = {
            integrated_number: process.env.MSG91_INTEGRATED_NUMBER,
            content_type: "template",
            payload: {
                messaging_product: "whatsapp",
                type: "template",
                template: {
                    name: MSG91_ID_CARD_ORDER,
                    language: {
                        code: "en",
                        policy: "deterministic",
                    },
                    namespace: MSG91_NAMESPACE,
                    to_and_components: [
                        {
                            to: [`91${phone}`],
                            components: {
                                body_1: {
                                    type: "text",
                                    value: school_name,
                                },
                                body_2: {
                                    type: "text",
                                    value: mobile_number,
                                },
                                body_3: {
                                    type: "text",
                                    value: order_date,
                                },
                            },
                        },
                    ],
                },
            },
        };

        const headers = {
            authkey: process.env.MSG91_AUTH_KEY,
            "Content-Type": "application/json",
            Accept: "application/json",
        };

        const response = await axios.post(
            "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
            payload,
            { headers }
        );

        const requestId = response.data.request_id;
        const sentDateTime = response.headers.date;
        return { requestId, sentDateTime };
    } catch (error) {
        console.error("MSG91 WhatsApp Error:", error.response?.data || error.message);
        throw new Error("WhatsApp message not sent");
    }
};

const otpWhatsappMessage = async (otp, phone) => {
    return await sendOtpWhatsappMessage(otp, phone);
};
const sendPlanPaymentConfirmationMessage = async (phone, user_name, transaction_message, invoice_number, payment_date, amount, plan_type, transaction_type, payment_id) => {
    return await sendPlanPaymentConfirmation(phone, user_name, transaction_message, invoice_number, payment_date, amount, plan_type, transaction_type, payment_id);
};
const feesConfirmationMessage = async (phone, school_name, academic_year, student_name, received_amount, date, receipt_no, class_name, admission_no, father_name, mother_name) => {
    return await sendFeesConfirmationWithoutReceipt(phone, school_name, academic_year, student_name, received_amount, date, receipt_no, class_name, admission_no, father_name, mother_name);
};
const sendManualFeeReminder = async (phone, school_name, father_name, pending_amount, student_name, class_name, last_date) => {
    return await sendManualFeeReminderMessage(phone, school_name, father_name, pending_amount, student_name, class_name, last_date);
};
const sendIdCardOrderMessage = async (phone, school_name, mobile_number, order_date) => {
    return await sendIdCardOrder(phone, school_name, mobile_number, order_date);
};

module.exports = {
    otpWhatsappMessage,
    sendPlanPaymentConfirmationMessage,
    feesConfirmationMessage,
    sendManualFeeReminder,
    sendIdCardOrderMessage
};