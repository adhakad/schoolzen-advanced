'use strict';
const AdmitCardStructureModel = require('../models/admit-card-structure');
const AdmitCardModel = require("../models/admit-card");
const StudentModel = require('../models/student');


let GetSingleClassAdmitCardStructureByStream = async (req, res, next) => {
    let adminId = req.params.id;
    let className = req.params.class;
    let stream = req.params.stream;
    if (stream === "stream") {
        stream = "n/a";
    }
    try {
        const singleAdmitCardStr = await AdmitCardStructureModel.findOne({ adminId: adminId, class: className, stream: stream });
        if (!singleAdmitCardStr) {
            return res.status(404).json('Fees structure not found!');
        }
        return res.status(200).json(singleAdmitCardStr);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}
let GetSingleClassAdmitCardStructure = async (req, res, next) => {
    let adminId = req.params.id;

    try {
        const singleAdmitCardStr = await AdmitCardStructureModel.find({ adminId: adminId });
        if (!singleAdmitCardStr) {
            return res.status(404).json('Fees structure not found!');
        }
        return res.status(200).json(singleAdmitCardStr);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}
let CreateAdmitCardStructure = async (req, res, next) => {
    let className = req.body.class;
    let { adminId, examType, stream } = req.body;
    let { examDate, startTime, endTime } = req.body.type;
    const examDateInvalid = examDate.some(obj =>
        Object.values(obj).some(v => v == null || v === '' || v === 'NaN/NaN/NaN')
    );
    const startTimeInvalid = startTime.some(obj =>
        Object.values(obj).some(v => v == null || v === '' || v === 'NaN/NaN/NaN')
    );
    const endTimeInvalid = endTime.some(obj =>
        Object.values(obj).some(v => v == null || v === '' || v === 'NaN/NaN/NaN')
    );
    const combinedData = examDate.map((dateObj, index) => {
        const [subject] = Object.keys(dateObj);
        const date = dateObj[subject].split('-').reverse().join('-');
        return {
            subject,
            date: new Date(date),
            examDate: dateObj,
            startTime: startTime[index],
            endTime: endTime[index]
        };
    }).sort((a, b) => a.date - b.date);
    const finalData = {
        examDate: combinedData.map(item => item.examDate),
        startTime: combinedData.map(item => item.startTime),
        endTime: combinedData.map(item => item.endTime)
    };
    if (stream === "stream") {
        stream = "n/a";
    }

    try {
        if (!examType) {
            return res.status(400).json(`Exam name is required!`);
        }
        if (examDateInvalid) {
            return res.status(400).json(`Exam date fields are missing or invalid!`);
        }
        if (startTimeInvalid) {
            return res.status(400).json(`Start time fields are missing or invalid!`);
        }
        if (endTimeInvalid) {
            return res.status(400).json(`End time fields are missing or invalid!`);
        }
        const checkAdmitCardStrExist = await AdmitCardStructureModel.findOne({ adminId: adminId, class: className, stream: stream });
        if (checkAdmitCardStrExist) {
            return res.status(400).json(`Admit card structure already exist!`);
        }
        const checkAdmitCardExist = await AdmitCardModel.findOne({ adminId: adminId, class: className, stream: stream });
        if (checkAdmitCardExist) {
            return res.status(400).json(`Admit card's already exist!`);
        }
        let admitCardStructureData = {
            adminId: adminId,
            class: className,
            examType: examType,
            stream: stream,
            examDate: finalData.examDate,
            examStartTime: finalData.startTime,
            examEndTime: finalData.endTime,
        }
        const checkStudent = await StudentModel.findOne({ adminId: adminId, class: className, stream: stream });
        if (!checkStudent) {
            return res.status(404).json('No student was found, please add students!')
        }
        const studentData = await StudentModel.find({ adminId: adminId, class: className, stream: stream });
        let studentAdmitCardData = [];
        for (const student of studentData) {
            studentAdmitCardData.push({
                adminId: adminId,
                studentId: student._id,
                class: className,
                stream: stream,
                examType: examType,
            });
        }
        let admitCardStructure = await AdmitCardStructureModel.create(admitCardStructureData);
        let studentAdmitCard = await AdmitCardModel.create(studentAdmitCardData);
        if (admitCardStructure && studentAdmitCard) {
            return res.status(200).json('Admit card structure created successfully');
        }

    } catch (error) {
        return res.status(500).json('Internal Server Error!');;
    }
}
let UpdateAdmitCardStructure = async (req, res, next) => {
    let className = req.body.class;
    let { adminId, examType, stream } = req.body;
    let { examDate, startTime, endTime } = req.body.type;
    const examDateInvalid = examDate.some(obj =>
        Object.values(obj).some(v => v == null || v === '' || v === 'NaN/NaN/NaN')
    );
    const startTimeInvalid = startTime.some(obj =>
        Object.values(obj).some(v => v == null || v === '' || v === 'NaN/NaN/NaN')
    );
    const endTimeInvalid = endTime.some(obj =>
        Object.values(obj).some(v => v == null || v === '' || v === 'NaN/NaN/NaN')
    );
    const combinedData = examDate.map((dateObj, index) => {
        const [subject] = Object.keys(dateObj);
        const date = dateObj[subject].split('-').reverse().join('-');
        return {
            subject,
            date: new Date(date),
            examDate: dateObj,
            startTime: startTime[index],
            endTime: endTime[index]
        };
    }).sort((a, b) => a.date - b.date);
    const finalData = {
        examDate: combinedData.map(item => item.examDate),
        startTime: combinedData.map(item => item.startTime),
        endTime: combinedData.map(item => item.endTime)
    };
    if (stream === "stream") {
        stream = "n/a";
    }

    try {
        if (!examType) {
            return res.status(400).json(`Exam name is required!`);
        }
        if (examDateInvalid) {
            return res.status(400).json(`Exam date fields are missing or invalid!`);
        }
        if (startTimeInvalid) {
            return res.status(400).json(`Start time fields are missing or invalid!`);
        }
        if (endTimeInvalid) {
            return res.status(400).json(`End time fields are missing or invalid!`);
        }
        const checkAdmitCardStrExist = await AdmitCardStructureModel.findOne({ adminId: adminId, class: className, stream: stream });
        if (!checkAdmitCardStrExist) {
            return res.status(404).json(`Admit card structure not found!`);
        }
        const previousExamType = checkAdmitCardStrExist.examType;
        const filter = { adminId: adminId, class: className, stream: stream };
        const update = {
            examType: examType,
            examDate: finalData.examDate,
            examStartTime: finalData.startTime,
            examEndTime: finalData.endTime
        };
        const options = { new: true, upsert: true };
        const updatedAdmitCardStructure = await AdmitCardStructureModel.findOneAndUpdate(filter, update, options);
        const updatedAdmitCard = await AdmitCardModel.updateMany({ adminId: adminId, class: className, stream: stream, examType: previousExamType }, { $set: { examType: examType } });
        if (updatedAdmitCardStructure && updatedAdmitCard) {
            return res.status(200).json('Admit card structure updated successfully');
        }

    } catch (error) {
        return res.status(500).json('Internal Server Error!');;
    }
}
let DeleteAdmitCardStructure = async (req, res, next) => {
    try {
        const id = req.params.id;
        const admitCard = await AdmitCardStructureModel.findOne({ _id: id });
        const adminId = admitCard.adminId;
        const className = admitCard.class;
        const stream = admitCard.stream;
        const examType = admitCard.examType;
        const deleteAdmitCard = await AdmitCardModel.deleteMany({ adminId: adminId, class: className, stream: stream, examType: examType });
        const deleteAdmitCardStructure = await AdmitCardStructureModel.findByIdAndRemove(id);
        if (deleteAdmitCard && deleteAdmitCardStructure) {
            return res.status(200).json('Admit card structure deleted successfully');
        }
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}
module.exports = {
    GetSingleClassAdmitCardStructure,
    GetSingleClassAdmitCardStructureByStream,
    CreateAdmitCardStructure,
    UpdateAdmitCardStructure,
    DeleteAdmitCardStructure,
}