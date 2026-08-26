'use strict';
const StaffBankDetailsModel = require('../models/staff-bank-details');
const StaffModel = require('../models/staff');
const logger = require('../helpers/logger');

// Plain storage of where a staff member salary would be sent. Read by nothing in this phase —
// no payout, no gateway, no verification against any bank. See models/staff-bank-details.js
// for why it exists now rather than later.

// Returns null (200, not 404) when nothing has been entered. "Not filled in yet" is the normal
// state for most staff and is not an error the caller should have to handle specially.
let GetStaffBankDetails = async (req, res, next) => {
    try {
        const { adminId, staffId } = req.params;
        const details = await StaffBankDetailsModel
            .findOne({ adminId: adminId, staffId: staffId })
            .lean();
        return res.status(200).json(details || null);
    } catch (error) {
        logger.error('staff-bank-details.GetStaffBankDetails', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// Upsert — one row per staff member (unique-indexed), so saving twice replaces rather than
// duplicating.
let SaveStaffBankDetails = async (req, res, next) => {
    try {
        const {
            adminId, staffId, accountHolderName, accountNumber, ifscCode, bankName, upiId,
        } = req.body;

        const staff = await StaffModel.findOne({ _id: staffId, adminId: adminId }, { _id: 1 }).lean();
        if (!staff) {
            return res.status(404).json('Staff member not found!');
        }

        await StaffBankDetailsModel.findOneAndUpdate(
            { adminId: adminId, staffId: staffId },
            {
                $set: {
                    accountHolderName: accountHolderName || '',
                    accountNumber: accountNumber || '',
                    ifscCode: ifscCode || '',
                    bankName: bankName || '',
                    upiId: upiId || '',
                },
                $setOnInsert: { adminId: adminId, staffId: staffId, createdAt: new Date() },
            },
            { upsert: true, new: true },
        );

        return res.status(200).json('Bank details saved successfully.');
    } catch (error) {
        logger.error('staff-bank-details.SaveStaffBankDetails', error);
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    GetStaffBankDetails,
    SaveStaffBankDetails,
}
