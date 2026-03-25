'use strict';
const StudentModel = require('../models/student');
const FeesCollectionModel = require('../models/fees-collection');
const AdmitCardModel = require('../models/admit-card');
const ExamResultModel = require('../models/exam-result');
const IssuedTransferCertificateModel = require('../models/issued-transfer-certificate');

let countIssuedTransferCertificate = async (req, res, next) => {
    let adminId = req.params.adminId;
    let countIssuedTransferCertificate = await IssuedTransferCertificateModel.count({ adminId: adminId });
    return res.status(200).json({ countIssuedTransferCertificate });
}

let GetIssuedTransferCertificatePagination = async (req, res, next) => {
    let searchText = req.body.filters.searchText;
    let adminId = req.body.adminId;
    let searchObj = {};
    if (searchText) {
        searchObj = /^(?:\d*\.\d{1,2}|\d+)$/.test(searchText) ? { $or: [{ class: searchText }, { rollNumber: searchText }, { admissionNo: searchText }] } : { name: new RegExp(`${searchText.toString().trim()}`, 'i') }
    }
    try {
        let limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
        let page = req.body.page || 1;
        const issuedTransferCertificateList = await IssuedTransferCertificateModel.find({ adminId: adminId }).find(searchObj).sort({ _id: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
        const countIssuedTransferCertificate = await IssuedTransferCertificateModel.count({ adminId: adminId });
        let issuedTransferCertificateData = { countIssuedTransferCertificate: 0 };
        issuedTransferCertificateData.issuedTransferCertificateList = issuedTransferCertificateList;
        issuedTransferCertificateData.countIssuedTransferCertificate = countIssuedTransferCertificate;
        return res.json(issuedTransferCertificateData);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let CreateIssuedTransferCertificate = async (req, res, next) => {
    let { adminId, serialNo, name, rollNumber, aadharNumber, samagraId, session, stream, admissionNo, dob, doa, gender, category, religion, nationality, address, fatherName, fatherQualification, fatherOccupation, motherOccupation, parentsContact, familyAnnualIncome, motherName, motherQualification } = req.body;
    let id = req.body._id;
    let className = req.body.class;

    if (stream === "stream") {
        stream = "n/a";
    }

    const studentData = {
        adminId, serialNo: serialNo, name, rollNumber, aadharNumber, samagraId, class: className, session, stream, admissionNo, dob, doa, gender, category, religion, nationality, address, fatherName, fatherQualification, fatherOccupation, motherOccupation, parentsContact, familyAnnualIncome, motherName, motherQualification
    }
    try {
        const deleteStudent = await StudentModel.findByIdAndRemove(id);
        if (deleteStudent) {
            const [deleteAdmitCard, deleteExamResult, deleteFeesCollection] = await Promise.all([
                AdmitCardModel.deleteOne({ studentId: id }),
                ExamResultModel.deleteOne({ studentId: id }),
                FeesCollectionModel.deleteOne({ studentId: id }),
            ]);
            if (deleteAdmitCard || deleteExamResult || deleteFeesCollection) {
                let createIssuedTransferCertificate = await IssuedTransferCertificateModel.create(studentData);
                if (createIssuedTransferCertificate) {
                    return res.status(200).json({ IssueTransferCertificate: 'IssueTransferCertificate', successMsg: `Transfer Certificate has been successfully created, and the student's data is now available on the Issued Transfer Certificate page` });
                }
            }
            let createIssuedTransferCertificate = await IssuedTransferCertificateModel.create(studentData);
            if (createIssuedTransferCertificate) {
                return res.status(200).json({ IssueTransferCertificate: 'IssueTransferCertificate', successMsg: `Transfer Certificate has been successfully created, and the student's data is now available on the Issued Transfer Certificate page` });
            }
        }
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let DeleteIssuedTransferCertificate = async (req, res, next) => {
    try {
        const id = req.params.id;
        const lastIssuedTC = await IssuedTransferCertificateModel.findOne({}).sort({ _id: -1 });
        const objectId = lastIssuedTC._id;
        if (id == objectId) {
            return res.status(400).json('The most recently issued transfer certificate cannot be deleted to maintain accurate records!');
        }

        const issuedTransferCertificate = await IssuedTransferCertificateModel.findByIdAndRemove(id);
        return res.status(200).json('Issued transfer certificate detail deleted successfully');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    countIssuedTransferCertificate,
    GetIssuedTransferCertificatePagination,
    CreateIssuedTransferCertificate,
    DeleteIssuedTransferCertificate
}