'use strict';
const AdminUserModel = require('../models/users/admin-user');
const SchoolModel = require('../models/school');
const { sendIdCardOrderMessage } = require('../services/send-whatsapp-message');
const { DateTime } = require('luxon');
const idCardOrderRecieverDetail = ['9340700360']
let OrderIdCard = async (req, res, next) => {
    const currentDateIst = DateTime.now().setZone('Asia/Kolkata');
    const istDateTimeString = currentDateIst.toFormat('dd-MM-yyyy hh:mm:ss a');
    try {
        let id = req.params.id;
        let adminUser = await AdminUserModel.findOne({ _id: id });
        if (!adminUser) {
            return res.status(404).json('Invailid request!');
        }

        let singleSchool = await SchoolModel.findOne({ adminId: id });
        if (!singleSchool) {
            return res.status(404).json('Invailid request!');
        }
        for (const detail of idCardOrderRecieverDetail) {
            sendIdCardOrderMessage(detail, singleSchool.schoolName, singleSchool.phoneOne, istDateTimeString);
        }
        return res.status(200).json('Your ID Card order request has been sent. Schoolzen Team will contact you soon.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    OrderIdCard
}
