'use strict';
const ExamResultModel = require('../models/exam-result');
const MarksheetTemplateStructureModel = require('../models/marksheet-template-structure');
const MarksheetTemplateModel = require('../models/marksheet-template');
const StudentModel = require('../models/student');
const AdminUsersModel = require('../models/users/admin-user');
const { DateTime } = require('luxon');

let countExamResult = async (req, res, next) => {
    let adminId = req.params.adminId;
    let countExamResult  = await ExamResultModel.count({adminId:adminId});
    return res.status(200).json({ countExamResult  });
}
let GetSingleStudentExamResult = async (req, res, next) => {
    let { schoolId, admissionNo, rollNumber } = req.body;
    let className = req.body.class;

    try {

        let admin = await AdminUsersModel.findOne({ schoolId: schoolId });
        if (!admin) {
            return res.status(404).json({ errorMsg: 'Invalid request!' });
        }
        let adminId = admin._id;
        let student = await StudentModel.findOne({ adminId: adminId, admissionNo: admissionNo, class: className, rollNumber: rollNumber }, 'adminId session admissionNo name rollNumber class fatherName motherName stream');
        if (!student) {
            return res.status(404).json({ errorMsg: 'Student not found!' });
        }
        let studentId = student._id;
        let stream = student.stream;
        if (stream === "stream") {
            stream = "n/a";
        }
        let examResult = await ExamResultModel.findOne({ adminId: adminId, studentId: studentId })
        if (!examResult) {
            return res.status(404).json({ errorMsg: 'Exam result not found!' });
        }
        let examType = examResult.examType;
        let resultPublishStatus = examResultStructure.resultPublishStatus;
        if (resultPublishStatus == false) {
            return res.status(404).json({ errorMsg: 'Your exam result will be declared soon!' });
        }
        return res.status(200).json({ examResult: examResult, studentInfo: student });
    } catch (error) {
        return res.status(500).json({ errorMsg: 'Internal Server Error !' });
    }
}
let GetSingleStudentExamResultById = async (req, res, next) => {
    let studentId = req.params.id;
    try {
        let student = await StudentModel.findOne({ _id: studentId }, 'session admissionNo name rollNumber class fatherName motherName stream');
        if (!student) {
            return res.status(404).json({ errorMsg: 'Student not found!' });
        }
        let stream = student.stream;
        let className = student.class;
        let adminId = student.adminId;
        if (stream === "stream") {
            stream = "n/a";
        }
        let examResult = await ExamResultModel.findOne({ adminId: adminId, studentId: studentId });
        if (!examResult) {
            return res.status(404).json({ errorMsg: 'Exam result not found!' });
        }
        let examType = examResult.examType;
        let resultPublishStatus = examResultStructure.resultPublishStatus;
        if (resultPublishStatus == false) {
            return res.status(404).json({ errorMsg: 'Your exam result will be declared soon!' });
        }
        return res.status(200).json({ examResultStructure: examResultStructure, examResult: examResult, studentInfo: student });
    } catch (error) {
        return res.status(500).json({ errorMsg: 'Internal Server Error!' });
    }
}
let GetAllStudentResultByClassStream = async (req, res, next) => {
    const currentDateIst = DateTime.now().setZone('Asia/Kolkata');
    let isDate = currentDateIst.toFormat('dd-MM-yyyy');
    let adminId = req.params.id;
    let className = req.params.class;
    let stream = req.params.stream;
    if (stream === "stream") {
        stream = "n/a";
    }
    let streamMsg = `${stream} stream`;
    try {
        const student = await StudentModel.find({ adminId: adminId, class: className, stream: stream },'adminId session admissionNo name dob rollNumber class fatherName motherName stream').sort({name:1});
        if (student.length <= 0) {
            return res.status(404).json({ statusCode: 404, errorMsg: 'Not Found!' });
        }

        let examResult = await ExamResultModel.find({ adminId: adminId, class: className, stream: stream });
        if (examResult.length <= 0) {
            examResult = 0;
        }
        let marksheetTemplate = await MarksheetTemplateModel.findOne({ adminId: adminId, class: className, stream: stream });
        if (!marksheetTemplate) {
            if (stream === "n/a") {
                streamMsg = ``;
            }
            return res.status(404).json({ statusCode: 404, errorMsg: `Not Found!` });
        }
        let templateName = marksheetTemplate.templateName;
        let marksheetTemplateStructure = await MarksheetTemplateStructureModel.findOne({ templateName: templateName });
        if (!marksheetTemplateStructure) {
            if (stream === "n/a") {
                streamMsg = ``;
            }
            return res.status(404).json({ errorMsg: `Not Found!` });
        }
        return res.status(200).json({ studentInfo: student, examResultInfo: examResult, marksheetTemplateStructure: marksheetTemplateStructure, isDate: isDate });
    } catch (error) {
        return res.status(500).json({ errorMsg: 'Internal Server Error!' });
    }
}

let GetAllStudentExamResultByClass = async (req, res, next) => {
    const currentDateIst = DateTime.now().setZone('Asia/Kolkata');
    let isDate = currentDateIst.toFormat('dd-MM-yyyy');
    let adminId = req.params.id;
    let className = req.params.class;
    let stream = req.params.stream;
    if (stream === "stream") {
        stream = "n/a";
    }
    let streamMsg = `${stream} stream`;
    try {
        const student = await StudentModel.find({ adminId: adminId, class: className, stream: stream }, 'adminId session admissionNo name dob rollNumber class fatherName motherName stream');
        if (student.length <= 0) {
            return res.status(404).json({ errorMsg: 'This class any student not found!' });
        }


        let marksheetTemplate = await MarksheetTemplateModel.findOne({ adminId: adminId, class: className, stream: stream });
        if (!marksheetTemplate) {
            if (stream === "n/a") {
                streamMsg = ``;
            }
            return res.status(404).json({ errorMsg: `This class ${streamMsg} marksheet template not found!` });
        }
        const examResult = await ExamResultModel.find({ adminId: adminId, class: className, stream });
        if (examResult.length <= 0) {
            return res.status(404).json({ errorMsg: 'This class exam result not found!' });
        }
        return res.status(200).json({ examResultInfo: examResult, studentInfo: student, marksheetTemplateStructure: marksheetTemplate, isDate: isDate });
    } catch (error) {
        return res.status(500).json({ errorMsg: 'Internal Server Error!' });
    }
}

// let GetExamResultPagination = async (req, res, next) => {
//     let className = req.body.class;
//     let searchText = req.body.filters.searchText;
//     let searchObj = {};
//     if (searchText) {
//         searchObj = /^(?:\d*\.\d{1,2}|\d+)$/.test(searchText)
//             ? {
//                 $or: [{ rollNumber: searchText }],
//             }
//             : { studentName: new RegExp(`${searchText.toString().trim()}`,'i') };
//     }

//     try {
//         let limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
//         let page = req.body.page || 1;
//         const examResultList = await ExamResultModel.find({ class: className }).find(searchObj)
//             .limit(limit * 1)
//             .skip((page - 1) * limit)
//             .exec();
//         const countExamResult = await ExamResultModel.count();

//         let examResultData = { countExamResult: 0 };
//         examResultData.examResultList = examResultList;
//         examResultData.countExamResult = countExamResult;
//         return res.json(examResultData);
//     } catch (error) {
//         return res.status(500).json({errorMsg:'Internal Server Error' });
//     }
// }

let CreateExamResult = async (req, res, next) => {
    let className = req.body.class;
    let { adminId, rollNumber, examType, stream, resultDetail, createdBy } = req.body;
    if (stream === "stream") {
        stream = "n/a";
    }
    try {
        const student = await StudentModel.findOne({ adminId: adminId, rollNumber: rollNumber, class: className, stream: stream });
        if (!student) {
            return res.status(404).json(`Roll number ${rollNumber} is invailid!`);
        }
        let studentId = student._id;
        const resultExist = await ExamResultModel.findOne({ adminId: adminId, studentId: studentId, class: className });
        if (resultExist) {
            const id = resultExist._id;
            let examTypeExist = Object.keys(resultExist.resultDetail);
            if (examTypeExist.length > 2) {
                return res.status(400).json(`Invalid entry!`);
            }
            if (examTypeExist[0] !== examType) {
                const updatedExamResult = await ExamResultModel.findByIdAndUpdate(id, { $set: { [`resultDetail.${examType}`]: { ...resultDetail, createdBy: createdBy, } } }, { new: true });
                return res.status(200).json('Student exam result created successfully');
            }
            if (examTypeExist[1] !== examType) {
                const updatedExamResult = await ExamResultModel.findByIdAndUpdate(id, { $set: { [`resultDetail.${examType}`]: { ...resultDetail, createdBy: createdBy, } } }, { new: true });
                return res.status(200).json('Student exam result created successfully');
            }
            return res.status(400).json(`Roll number ${rollNumber} ${examType} result already exist!`);
        }
        let examResultData = {
            adminId: adminId,
            studentId: studentId,
            stream: stream,
            class: className,
            resultDetail: {
                [examType]: {
                    ...resultDetail,
                    createdBy: createdBy,
                }
            }
        }
        let createExamResult = await ExamResultModel.create(examResultData);
        return res.status(200).json('Student exam result created successfully');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

// let CreateBulkExamResult = async (req, res, next) => {
//     let { examType, stream, createdBy } = req.body;
//     let className = req.body.bulkResult[0].Class
//     if (stream === "stream") {
//         stream = "n/a";
//     }
//     let result = [];
//     let newClsRollNumber = [];
//     result = req.body.bulkResult.map(entry => {
//         const rollNumber = entry['Roll Number'];
//         newClsRollNumber.push(rollNumber);
//         const studentClass = entry.Class;
//         const theoryMarks = [];
//         const practicalMarks = [];
//         for (const subject in entry) {
//             if (subject !== 'Roll Number' && subject !== 'Class') {
//                 const marks = entry[subject];
//                 const modifiedSubject = subject.replace(' Practical', '');
//                 const marksEntry = { [modifiedSubject]: marks };

//                 if (subject.includes('Practical')) {
//                     practicalMarks.push(marksEntry);
//                 } else {
//                     theoryMarks.push(marksEntry);
//                 }
//             }
//         }
//         const resultEntry = {
//             examType: examType,
//             stream: stream,
//             class: studentClass,
//             theoryMarks: theoryMarks,
//             createdBy: createdBy,
//         };
//         if (practicalMarks.length > 0) {
//             resultEntry.practicalMarks = practicalMarks;
//         }
//         return resultEntry;
//     });

//     try {
//         const students = await StudentModel.find({ 'rollNumber': { $in: newClsRollNumber }, class: className }, '_id rollNumber');
//         if (students.length == 0) {
//             return res.status(404).json(`All roll number invalid !`);
//         }
//         if (newClsRollNumber.length > students.length) {
//             let studentRollNumber = [];
//             for (let i = 0; i < students.length; i++) {
//                 studentRollNumber.push(students[i].rollNumber);
//             }
//             let invalidRollNumber = newClsRollNumber.filter((rollNumber1) => studentRollNumber.some((rollNumber2) => rollNumber1 !== rollNumber2))
//             let spreadRollNumber = invalidRollNumber.join(' ,');
//             return res.status(404).json(`Roll number ${spreadRollNumber} is invalid !`);
//         }
//         let newClsStudentId = [];
//         for (let i = 0; i < result.length; i++) {
//             let objId = students[i]._id.toString();
//             newClsStudentId.push(objId);
//             result[i].studentId = objId;
//         }
//         let existingItems = await ExamResultModel.find({ class: className }).lean();
//         let existingClsStudentId = existingItems.map(item => item.studentId);
//         let existStudentId = existingClsStudentId.filter((studentId1) => newClsStudentId.some((studentId2) => studentId1 === studentId2))
//         if (existStudentId.length > 0) {
//             const student = await StudentModel.find({
//                 '_id': { $in: existStudentId },
//                 class: className
//             }, 'rollNumber');
//             let existRollNumber = [];
//             for (let i = 0; i < student.length; i++) {
//                 existRollNumber.push(student[i].rollNumber);
//             }
//             if (existRollNumber.length > 0) {
//                 let spreadRollNumber = existRollNumber.join(' ,');
//                 return res.status(400).json(`Roll number  ${spreadRollNumber} result already exist !`);
//             }

//         }
//         let createExamResult = await ExamResultModel.create(result);
//         return res.status(200).json('Student exam result add successfully.');

//     } catch (error) {
//         return res.status(500).json('Internal Server Error !');
//     }
// }
let DeleteMarksheetResult = async (req, res, next) => {
    try {
        const id = req.params.id;
        const result = await ExamResultModel.findOne({ _id: id });
        if (!result) {
            return res.status(404).json('Marksheet result not found!');
        }
        const deleteResult = await ExamResultModel.findByIdAndRemove(id);
        if (deleteResult) {
            return res.status(200).json('Marksheet result deleted successfully');
        }
    } catch (error) {
        return res.status(500).json('Internal Server Error !');;
    }
}
module.exports = {
    countExamResult,
    GetSingleStudentExamResult,
    GetSingleStudentExamResultById,
    GetAllStudentExamResultByClass,
    GetAllStudentResultByClassStream,
    CreateExamResult,
    DeleteMarksheetResult
    // CreateBulkExamResult,
}