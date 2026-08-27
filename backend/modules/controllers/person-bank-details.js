'use strict';
const PersonBankDetailsModel = require('../models/person-bank-details');
const { getModel } = require('../services/person-lookup');
const { PAYABLE_TYPES } = require('../services/payroll-attendance');
const logger = require('../helpers/logger');

// Plain storage of where a person's salary would be sent. Read by nothing in this phase —
// no payout, no gateway, no verification against any bank. See models/person-bank-details.js
// for why it exists now rather than later.

const isPayable = (personType) => PAYABLE_TYPES.includes(personType);

// Returns null (200, not 404) when nothing has been entered. "Not filled in yet" is the normal
// state for most people and is not an error the caller should have to handle specially.
let GetPersonBankDetails = async (req, res, next) => {
    try {
        const { adminId, personType, personId } = req.params;
        if (!isPayable(personType)) {
            return res.status(400).json('A valid person type is required!');
        }
        const details = await PersonBankDetailsModel
            .findOne({ adminId: adminId, personType: personType, personId: personId })
            .lean();
        return res.status(200).json(details || null);
    } catch (error) {
        logger.error('person-bank-details.GetPersonBankDetails', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// Upsert — one row per person (unique-indexed), so saving twice replaces rather than
// duplicating.
let SavePersonBankDetails = async (req, res, next) => {
    try {
        const {
            adminId, personType, personId, accountHolderName, accountNumber, ifscCode, bankName, upiId,
        } = req.body;

        const model = getModel(personType);
        if (!isPayable(personType) || !model) {
            return res.status(400).json('A valid person type is required!');
        }

        const person = await model.findOne({ _id: personId, adminId: adminId }, { _id: 1 }).lean();
        if (!person) {
            return res.status(404).json('This person was not found!');
        }

        await PersonBankDetailsModel.findOneAndUpdate(
            { adminId: adminId, personType: personType, personId: personId },
            {
                $set: {
                    accountHolderName: accountHolderName || '',
                    accountNumber: accountNumber || '',
                    ifscCode: ifscCode || '',
                    bankName: bankName || '',
                    upiId: upiId || '',
                },
                $setOnInsert: {
                    adminId: adminId, personType: personType, personId: personId, createdAt: new Date(),
                },
            },
            { upsert: true, new: true },
        );

        return res.status(200).json('Bank details saved successfully.');
    } catch (error) {
        logger.error('person-bank-details.SavePersonBankDetails', error);
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    GetPersonBankDetails,
    SavePersonBankDetails,
}
