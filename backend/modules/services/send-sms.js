'use strict';
const twilio = require('twilio');
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
let commonSMS = async (message, phone) => {
    try {
        return await client.messages.create({
            body: message,
            from: TWILIO_PHONE_NUMBER,
            to: phone
        });
    }
    catch (e) {
        console.log(e)
    }
}

let paymentSuccessSMS = async (amount, phone) => {
    let msgbody = `Dear Parent, ₹${amount} fees for {studentName} has been received on {date}. Thank you - {schoolName}.`
    return commonSMS(msgbody, phone)
};

module.exports = {
    paymentSuccessSMS
}
