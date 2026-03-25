'use strict';
const SchoolModel = require('../models/school');
const FeesCollectionModel = require('../models/fees-collection');
const FeesStructureModel = require('../models/fees-structure');
const StudentModel = require('../models/student');
const FeesConfirmationLogsModel = require('../models/whatsapp-message/fees-confirmation-logs');
const { getClassDisplayName } = require('../helpers/format-class-name');
const { toTitleCase } = require('../helpers/titlecase');
const { feesConfirmationMessage } = require('../services/send-whatsapp-message');
const { checkWhatsappLimit, updateWhatsappUsage } = require('../services/whatsapp-message-wallet');
const { DateTime } = require('luxon');

let GetStudentFeesCollectionBySession = async (req, res, next) => {
    let adminId = req.params.adminId;
    let session = req.params.session;
    try {
        const allFees = await FeesCollectionModel.find({ adminId: adminId, session: session });
        let totalFeesSum = 0, paidFeesSum = 0, dueFeesSum = 0;

        for (let i = 0; i < allFees.length; i++) {
            totalFeesSum += allFees[i].totalFees;
            paidFeesSum += allFees[i].paidFees;
            dueFeesSum += allFees[i].dueFees;
        }
        function findMonthlyPayments(feesData) {
            const monthsMap = {
                '01': 'January',
                '02': 'February',
                '03': 'March',
                '04': 'April',
                '05': 'May',
                '06': 'June',
                '07': 'July',
                '08': 'August',
                '09': 'September',
                '10': 'October',
                '11': 'November',
                '12': 'December'
            };

            const monthlyPayments = {};

            // Initialize all 12 months with 0
            for (let monthNum in monthsMap) {
                monthlyPayments[monthsMap[monthNum]] = 0;
            }

            for (let i = 0; i < feesData.length; i++) {
                let data = feesData[i];

                // Check and add admission fees
                if (data.admissionFees > 0 && data.admissionFeesPaymentDate) {
                    const admissionPaymentDate = data.admissionFeesPaymentDate;
                    const [admissionDatePart] = admissionPaymentDate.split(' ');
                    const [day, month] = admissionDatePart.split('-').slice(0, 2);
                    const monthName = monthsMap[month];

                    if (monthName) {
                        monthlyPayments[monthName] += data.admissionFees;
                    }
                }

                // Loop through each installment
                for (let j = 0; j < data.installment.length; j++) {
                    let amount = data.installment[j];
                    let paymentDate = data.paymentDate[j];

                    if (paymentDate) {
                        const [datePart] = paymentDate.split(' ');
                        const [day, month] = datePart.split('-');
                        const monthName = monthsMap[month];

                        if (monthName) {
                            monthlyPayments[monthName] += amount;
                        }
                    }
                }
            }

            return monthlyPayments;
        }

        // Call function and log results
        const monthlyPaymentFees = findMonthlyPayments(allFees);

        return res.status(200).json({ monthlyPaymentFees: monthlyPaymentFees, totalFeesSum: totalFeesSum, paidFeesSum: paidFeesSum, dueFeesSum: dueFeesSum });
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetSingleStudentFeesCollectionByStudentId = async (req, res, next) => {
    let adminId = req.params.adminId;
    let id = req.params.id;
    try {
        const studentFeesCollection = await FeesCollectionModel.findOne({ _id: id, adminId: adminId });
        const studentId = studentFeesCollection.studentId;
        const session = studentFeesCollection.session;
        if (studentFeesCollection.previousSessionClass > 0) {
            const className = studentFeesCollection.previousSessionClass;
            const stream = studentFeesCollection.previousSessionStream;
            const student = await StudentModel.findOne({ _id: studentId, adminId: adminId }, '_id adminId session admissionNo name rollNumber class stream fatherName motherName dob');
            const allFeesSession = await FeesCollectionModel.find({ adminId: adminId, studentId: studentId }, 'adminId session previousSessionClass previousSessionStream');
            const singleFeesStr = await FeesStructureModel.findOne({ adminId: adminId, session: session, class: className, stream: stream });
            if (!singleFeesStr) {
                return res.status(404).json('Fee Structure not found!');
            }
            return res.status(200).json({ allFeesSession: allFeesSession, studentInfo: student, singleFeesStr: singleFeesStr, studentFeesCollection: studentFeesCollection });
        }
        if (studentFeesCollection.previousSessionClass == 0) {
            const className = studentFeesCollection.class;
            const stream = studentFeesCollection.stream;
            const student = await StudentModel.findOne({ _id: studentId, adminId: adminId }, '_id adminId session admissionNo name rollNumber class stream fatherName motherName dob');
            const allFeesSession = await FeesCollectionModel.find({ adminId: adminId, studentId: studentId }, 'adminId session previousSessionClass previousSessionStream');
            const singleFeesStr = await FeesStructureModel.findOne({ adminId: adminId, session: session, class: className, stream: stream });
            if (!singleFeesStr) {
                return res.status(404).json('Fee Structure not found!');
            }
            return res.status(200).json({ allFeesSession: allFeesSession, studentInfo: student, singleFeesStr: singleFeesStr, studentFeesCollection: studentFeesCollection });
        }
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetSingleStudentFeesCollectionById = async (req, res, next) => {
    let adminId = req.params.adminId;
    let studentId = req.params.studentId;
    try {
        const student = await StudentModel.findOne({ _id: studentId, adminId: adminId }, '_id adminId session admissionNo name rollNumber class stream fatherName motherName dob');
        if (!student) {
            return res.status(404).json('Student not found!');
        }
        let session = student.session;
        const studentFeesCollection = await FeesCollectionModel.findOne({ adminId: adminId, studentId: studentId, session: session });
        const className = studentFeesCollection.class;
        const stream = studentFeesCollection.stream;
        const allFeesSession = await FeesCollectionModel.find({ adminId: adminId, studentId: studentId }, 'adminId studentId session');
        const singleFeesStr = await FeesStructureModel.findOne({ adminId: adminId, session: session, class: className, stream: stream });
        if (!singleFeesStr) {
            return res.status(404).json('Fee Structure not found!');
        }
        return res.status(200).json({ allFeesSession: allFeesSession, studentInfo: student, singleFeesStr: singleFeesStr, studentFeesCollection: studentFeesCollection });
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}


let GetPayableSingleStudentFeesCollectionById = async (req, res, next) => {
    let studentId = req.params.studentId;

    try {
        const student = await StudentModel.findOne({ _id: studentId }, '_id adminId session admissionNo name rollNumber class stream fatherName motherName dob');
        if (!student) {
            return res.status(404).json('Student not found!')
        }
        let adminId = student.adminId;
        const studentPeviousFeesCollection = await FeesCollectionModel.findOne({ adminId: adminId, studentId: studentId, previousSessionFeesStatus: true });
        if (studentPeviousFeesCollection) {
            let session = studentPeviousFeesCollection.session;
            let className = studentPeviousFeesCollection.class;
            let stream = studentPeviousFeesCollection.stream;
            const singleFeesStr = await FeesStructureModel.findOne({ adminId: adminId, session: session, class: className, stream: stream });
            if (!singleFeesStr) {
                return res.status(404).json(`Fees structure not found!`);
            }
            return res.status(200).json({ studentInfo: student, singleFeesStr: singleFeesStr, studentFeesCollection: studentPeviousFeesCollection });
        }
        const studentFeesCollection = await FeesCollectionModel.findOne({ adminId: adminId, studentId: studentId, previousSessionFeesStatus: false });
        if (studentFeesCollection) {
            let session = studentFeesCollection.session;
            let className = studentFeesCollection.class;
            let stream = studentFeesCollection.stream;
            const singleFeesStr = await FeesStructureModel.findOne({ adminId: adminId, session: session, class: className, stream: stream });
            if (!singleFeesStr) {
                return res.status(404).json(`Fees structure not found!`);
            }
            return res.status(200).json({ studentInfo: student, singleFeesStr: singleFeesStr, studentFeesCollection: studentFeesCollection });
        }
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetAllStudentFeesCollectionByClass = async (req, res, next) => {
    let adminId = req.params.id;
    let className = req.params.class;
    let stream = req.params.stream;
    if (stream === "stream") {
        stream = "n/a";
    }
    try {
        const student = await StudentModel.find({ adminId: adminId, class: className, stream: stream }, '_id session admissionNo name rollNumber class stream fatherName motherName dob');
        if (!student) {
            return res.status(404).json('Student not found!')
        }
        const studentFeesCollection = await FeesCollectionModel.find({ adminId: adminId, class: className, stream: stream, previousSessionClass: 0, previousSessionStream: 'empty' });
        if (!studentFeesCollection) {
            return res.status(404).json('Student fees collection not found!')
        }
        return res.status(200).json({ studentFeesCollection: studentFeesCollection, studentInfo: student });
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let CreateFeesCollection = async (req, res, next) => {
    let className = req.body.class;
    let { adminId, session, studentId, stream, feesAmount, createdBy } = req.body;

    if (stream === "stream") {
        stream = "n/a";
    }

    let receiptNo = Math.floor(Math.random() * 899999 + 100000);
    const currentDateIst = DateTime.now().setZone('Asia/Kolkata');
    const istDateTimeString = currentDateIst.toFormat('dd-MM-yyyy hh:mm:ss a');
    const date = currentDateIst.toFormat('dd-MM-yyyy');

    try {
        const limitCheck = await checkWhatsappLimit(adminId, 1);
        if (!limitCheck.isAllowed) {
            let errorMsg = limitCheck.message;
            return res.status(400).json(errorMsg);
        }
        const schoolInfo = await SchoolModel.findOne({ adminId });
        if (!schoolInfo) {
            return res.status(404).json("School detail not found!");
        }

        const isStudent = await StudentModel.findOne({ _id: studentId, adminId: adminId });
        if (!isStudent) {
            return res.status(404).json(`Student not found!`);
        }

        let school_name = toTitleCase(`${schoolInfo.schoolName}, ${schoolInfo.city}, ${schoolInfo.state}`);
        let phone = isStudent.parentsContact ? `${isStudent.parentsContact}` : null;
        let student_name = toTitleCase(isStudent.name);
        let father_name = toTitleCase(isStudent.fatherName);
        let mother_name = toTitleCase(isStudent.motherName);
        let admission_no = isStudent.admissionNo;
        let class_name = getClassDisplayName(className);
        const checkFeesStructure = await FeesStructureModel.findOne({ adminId, session, class: className, stream });
        if (!checkFeesStructure) {
            return res.status(404).json(`Fees structure not found!`);
        }

        const checkFeesCollection = await FeesCollectionModel.findOne({ adminId, session, studentId, class: className, stream });
        if (!checkFeesCollection) {
            return res.status(404).json(`Fees record not found!`);
        }

        /** Helper function to send confirmation + log + update usage */
        const sendWhatsappAndLog = async () => {

            const { requestId, sentDateTime } = await feesConfirmationMessage(
                phone,
                school_name,
                session,
                student_name,
                feesAmount,
                date,
                receiptNo,
                class_name,
                admission_no,
                father_name,
                mother_name
            );

            if (requestId) {
                await FeesConfirmationLogsModel.updateOne(
                    { adminId, studentId: isStudent._id },
                    {
                        $set: { lastMessageSentAt: new Date() },
                        $push: {
                            logs: {
                                requestId,
                                status: "sent",
                                sentAt: sentDateTime
                            }
                        }
                    },
                    { upsert: true }
                );
                await updateWhatsappUsage(adminId, 1);
            }
            return {};
        };

        /** ========== CASE 1: previousSessionFeesStatus == false ========== */
        if (checkFeesCollection.previousSessionFeesStatus == false) {
            if (feesAmount > checkFeesCollection.dueFees) {
                return res.status(400).json(`Paying fees amount is greater than due fees amount rupees ${checkFeesCollection.dueFees} of session ${session}!`);
            }

            const totalFees = checkFeesCollection.totalFees;
            const paidFees = checkFeesCollection.paidFees + feesAmount;
            const dueFees = totalFees - paidFees;
            const AllPaidFees = checkFeesCollection.AllPaidFees + feesAmount;
            const AllDueFees = checkFeesCollection.AllDueFees - feesAmount;

            const feesData = {
                session: checkFeesCollection.session,
                receiptNo: receiptNo,
                totalFees: totalFees,
                feesConcession: checkFeesCollection.feesConcession,
                paidFees: paidFees,
                dueFees: dueFees,
                feesAmount: feesAmount,
                paymentDate: istDateTimeString,
                admissionFeesPayable: checkFeesCollection.admissionFeesPayable,
                admissionFees: checkFeesCollection.admissionFees,
                createdBy: createdBy
            };

            const updatedDocument = await FeesCollectionModel.findOneAndUpdate(
                { adminId, studentId, session },
                {
                    $push: {
                        installment: feesAmount,
                        receipt: receiptNo,
                        paymentDate: istDateTimeString,
                        createdBy
                    },
                    $set: {
                        totalFees,
                        paidFees,
                        dueFees,
                        AllPaidFees,
                        AllDueFees
                    }
                },
                { new: true }
            );

            if (updatedDocument) {
                if (phone !== null && phone !== undefined) {
                    const result = await sendWhatsappAndLog();
                }
                return res.status(200).json(feesData);
            }
        }

        /** ========== CASE 2: previousSessionFeesStatus == true ========== */
        if (checkFeesCollection.previousSessionFeesStatus == true) {
            const checkPreviousFeesCollection = await FeesCollectionModel.findOne({ adminId, studentId, previousSessionFeesStatus: false });
            if (!checkPreviousFeesCollection) {
                return res.status(404).json(`Fees record not found!`);
            }

            const previousSession = checkPreviousFeesCollection.session;
            const totalFeesPrev = checkPreviousFeesCollection.totalFees;
            const paidFeesPrev = checkPreviousFeesCollection.paidFees + feesAmount;
            const dueFeesPrev = totalFeesPrev - paidFeesPrev;
            const AllPaidFeesPrev = checkPreviousFeesCollection.AllPaidFees + feesAmount;
            const AllDueFeesPrev = checkPreviousFeesCollection.AllDueFees - feesAmount;

            const feesDataPrev = {
                session: previousSession,
                receiptNo: receiptNo,
                totalFees: totalFeesPrev,
                feesConcession: checkPreviousFeesCollection.feesConcession,
                paidFees: paidFeesPrev,
                dueFees: dueFeesPrev,
                feesAmount: feesAmount,
                paymentDate: istDateTimeString,
                admissionFeesPayable: checkPreviousFeesCollection.admissionFeesPayable,
                admissionFees: checkPreviousFeesCollection.admissionFees,
                createdBy: createdBy
            };

            // 2.1 When fully paying previous session fees
            if (feesAmount == checkPreviousFeesCollection.dueFees) {
                const currentSessionTotalFees = checkFeesCollection.totalFees;
                const updatedDocumentPrev = await FeesCollectionModel.findOneAndUpdate(
                    { adminId, studentId, session: previousSession },
                    {
                        $push: {
                            installment: feesAmount,
                            receipt: receiptNo,
                            paymentDate: istDateTimeString,
                            createdBy
                        },
                        $set: {
                            paidFees: paidFeesPrev,
                            dueFees: dueFeesPrev,
                            AllTotalFees: currentSessionTotalFees,
                            AllPaidFees: 0,
                            AllDueFees: currentSessionTotalFees,
                            allFeesConcession: checkFeesCollection.feesConcession
                        }
                    },
                    { new: true }
                );

                const updatedCurrent = await FeesCollectionModel.findOneAndUpdate(
                    { adminId, studentId, session },
                    {
                        $set: {
                            AllTotalFees: currentSessionTotalFees,
                            AllPaidFees: 0,
                            AllDueFees: currentSessionTotalFees,
                            allFeesConcession: checkFeesCollection.feesConcession
                        }
                    },
                    { new: true }
                );

                if (updatedDocumentPrev && updatedCurrent) {
                    if (phone !== null && phone !== undefined) {
                        const result = await sendWhatsappAndLog();
                    }
                    return res.status(200).json(feesDataPrev);
                }
            }

            // 2.2 When previous fees is 0 & moving to current session
            if (checkPreviousFeesCollection.dueFees == 0 && checkPreviousFeesCollection.AllPaidFees == 0) {
                if (feesAmount > checkFeesCollection.dueFees) {
                    return res.status(400).json(`Paying fees amount is greater than due fees amount rupees ${checkFeesCollection.dueFees} of session ${session}!`);
                }

                const totalFeesCurr = checkFeesCollection.totalFees;
                const paidFeesCurr = checkFeesCollection.paidFees + feesAmount;
                const dueFeesCurr = totalFeesCurr - paidFeesCurr;
                const AllPaidFeesCurr = checkFeesCollection.AllPaidFees + feesAmount;
                const AllDueFeesCurr = checkFeesCollection.AllDueFees - feesAmount;

                const feesDataCurr = {
                    session: checkFeesCollection.session,
                    receiptNo: receiptNo,
                    totalFees: totalFeesCurr,
                    feesConcession: checkFeesCollection.feesConcession,
                    paidFees: paidFeesCurr,
                    dueFees: dueFeesCurr,
                    feesAmount: feesAmount,
                    paymentDate: istDateTimeString,
                    admissionFeesPayable: checkFeesCollection.admissionFeesPayable,
                    admissionFees: checkFeesCollection.admissionFees,
                    createdBy: createdBy
                };

                const deletePrev = await FeesCollectionModel.findOneAndDelete({ adminId, studentId, session: previousSession });
                const updatedCurr = await FeesCollectionModel.findOneAndUpdate(
                    { adminId, studentId, session },
                    {
                        $push: {
                            installment: feesAmount,
                            receipt: receiptNo,
                            paymentDate: istDateTimeString,
                            createdBy
                        },
                        $set: {
                            previousSessionFeesStatus: false,
                            paidFees: paidFeesCurr,
                            dueFees: dueFeesCurr,
                            AllPaidFees: AllPaidFeesCurr,
                            AllDueFees: AllDueFeesCurr
                        }
                    },
                    { new: true }
                );

                if (updatedCurr && deletePrev) {
                    if (phone !== null && phone !== undefined) { console.log("a")
                        const result = await sendWhatsappAndLog();
                    }
                    return res.status(200).json(feesDataCurr);
                }
            }

            // 2.3 Partial payment in previous session
            if (feesAmount > checkPreviousFeesCollection.dueFees) {
                return res.status(400).json(`Paying fees amount is greater than due fees amount rupees ${checkPreviousFeesCollection.dueFees} of session ${session}!`);
            }

            const updatedPrevPartial = await FeesCollectionModel.findOneAndUpdate(
                { adminId, studentId, session: previousSession },
                {
                    $push: {
                        installment: feesAmount,
                        receipt: receiptNo,
                        paymentDate: istDateTimeString,
                        createdBy
                    },
                    $set: {
                        paidFees: paidFeesPrev,
                        dueFees: dueFeesPrev,
                        AllPaidFees: AllPaidFeesPrev,
                        AllDueFees: AllDueFeesPrev
                    }
                },
                { new: true }
            );

            const updatedCurrPartial = await FeesCollectionModel.findOneAndUpdate(
                { adminId, studentId, session },
                {
                    $set: {
                        AllPaidFees: AllPaidFeesPrev,
                        AllDueFees: AllDueFeesPrev
                    }
                },
                { new: true }
            );

            if (updatedPrevPartial && updatedCurrPartial) {
                if (phone !== null && phone !== undefined) {
                    const result = await sendWhatsappAndLog();
                }
                return res.status(200).json(feesDataPrev);
            }
        }

    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
};


// let CreateFeesCollection = async (req, res, next) => {
//     let className = req.body.class;
//     let { adminId, session, studentId, stream, feesAmount, createdBy } = req.body;
//     if (stream === "stream") {
//         stream = "n/a";
//     }
//     let receiptNo = Math.floor(Math.random() * 899999 + 100000);
//     const currentDateIst = DateTime.now().setZone('Asia/Kolkata');
//     const istDateTimeString = currentDateIst.toFormat('dd-MM-yyyy hh:mm:ss a');
//     const date = currentDateIst.toFormat('dd-MM-yyyy');
//     try {
//         const schoolInfo = await SchoolModel.findOne({ adminId });
//         if (!schoolInfo) {
//             return res.status(404).json({ errorMsg: "School detail not found!" });
//         }
//         const isStudent = await StudentModel.findOne({ _id: studentId, adminId: adminId });
//         if (!isStudent) {
//             return res.status(404).json(`Student not found!`);
//         }
//         let school_name = `${schoolInfo.schoolName}, ${schoolInfo.city}, ${schoolInfo.state}`;
//         let phone = `${isStudent.parentsContact}`;
//         let student_name = toTitleCase(isStudent.name);
//         let father_name = toTitleCase(isStudent.fatherName);
//         let mother_name = toTitleCase(isStudent.fatherName);
//         let admission_no = isStudent.admissionNo;
//         let class_name = getClassDisplayName(className);
//         const checkFeesStructure = await FeesStructureModel.findOne({ adminId: adminId, session: session, class: className, stream: stream });
//         if (!checkFeesStructure) {
//             return res.status(404).json(`Fees structure not found!`);
//         }
//         const checkFeesCollection = await FeesCollectionModel.findOne({ adminId: adminId, session: session, studentId: studentId, class: className, stream: stream });
//         if (!checkFeesCollection) {
//             return res.status(404).json(`Fees record not found!`);
//         }

//         if (checkFeesCollection.previousSessionFeesStatus == false) {
//             if (feesAmount > checkFeesCollection.dueFees) {
//                 return res.status(400).json(`Paying fees amount is greater then due fees amount rupees ${checkFeesCollection.dueFees} of session ${session}!`);
//             }
//             const totalFees = checkFeesCollection.totalFees;
//             const paidFees = checkFeesCollection.paidFees + feesAmount
//             const dueFees = totalFees - paidFees;
//             const AllPaidFees = checkFeesCollection.AllPaidFees + feesAmount;
//             const AllDueFees = checkFeesCollection.AllDueFees - feesAmount;
//             const feesData = {
//                 session: checkFeesCollection.session,
//                 receiptNo: receiptNo,
//                 totalFees: totalFees,
//                 feesConcession: checkFeesCollection.feesConcession,
//                 paidFees: paidFees,
//                 dueFees: dueFees,
//                 feesAmount: feesAmount,
//                 paymentDate: istDateTimeString,
//                 admissionFeesPayable: checkFeesCollection.admissionFeesPayable,
//                 admissionFees: checkFeesCollection.admissionFees,
//                 createdBy: createdBy
//             }
//             const updatedDocument = await FeesCollectionModel.findOneAndUpdate(
//                 {
//                     adminId: adminId,
//                     studentId: studentId,
//                     session: session
//                 },
//                 {
//                     $push: {
//                         installment: feesAmount,
//                         receipt: receiptNo,
//                         paymentDate: istDateTimeString,
//                         createdBy: createdBy
//                     },
//                     $set: {
//                         totalFees: totalFees,
//                         paidFees: paidFees,
//                         dueFees: dueFees,
//                         AllPaidFees: AllPaidFees,
//                         AllDueFees: AllDueFees
//                     }
//                 },
//                 {
//                     new: true // Return the updated document
//                 });
//             if (updatedDocument) {
//                 await feesConfirmationMessage(phone, school_name, session, student_name, feesAmount, date, receiptNo, class_name, admission_no, father_name, mother_name);
//                 return res.status(200).json(feesData);
//             }
//         }



//         if (checkFeesCollection.previousSessionFeesStatus == true) {
//             const checkPreviousFeesCollection = await FeesCollectionModel.findOne({ adminId: adminId, studentId: studentId, previousSessionFeesStatus: false });
//             if (!checkPreviousFeesCollection) {
//                 return res.status(404).json(`Fees record not found!`);
//             }
//             const previousSession = checkPreviousFeesCollection.session;
//             const totalFees = checkPreviousFeesCollection.totalFees;
//             const paidFees = checkPreviousFeesCollection.paidFees + feesAmount
//             const dueFees = totalFees - paidFees;
//             const AllPaidFees = checkPreviousFeesCollection.AllPaidFees + feesAmount;
//             const AllDueFees = checkPreviousFeesCollection.AllDueFees - feesAmount;
//             const feesData = {
//                 session: previousSession,
//                 receiptNo: receiptNo,
//                 totalFees: totalFees,
//                 feesConcession: checkPreviousFeesCollection.feesConcession,
//                 paidFees: paidFees,
//                 dueFees: dueFees,
//                 feesAmount: feesAmount,
//                 paymentDate: istDateTimeString,
//                 admissionFeesPayable: checkPreviousFeesCollection.admissionFeesPayable,
//                 admissionFees: checkPreviousFeesCollection.admissionFees,
//                 createdBy: createdBy
//             }
//             if (feesAmount == checkPreviousFeesCollection.dueFees) {
//                 const currentSessionTotalFees = checkFeesCollection.totalFees;
//                 const updatedDocument = await FeesCollectionModel.findOneAndUpdate(
//                     {
//                         adminId: adminId,
//                         studentId: studentId,
//                         session: previousSession
//                     },
//                     {
//                         $push: {
//                             installment: feesAmount,
//                             receipt: receiptNo,
//                             paymentDate: istDateTimeString,
//                             createdBy: createdBy
//                         },
//                         $set: {
//                             paidFees: paidFees,
//                             dueFees: dueFees,
//                             AllTotalFees: currentSessionTotalFees,
//                             AllPaidFees: 0,
//                             AllDueFees: currentSessionTotalFees,
//                             allFeesConcession: checkFeesCollection.feesConcession,
//                         }
//                     },
//                     {
//                         new: true
//                     });
//                 const updated = await FeesCollectionModel.findOneAndUpdate(
//                     {
//                         adminId: adminId,
//                         studentId: studentId,
//                         session: session
//                     },
//                     {
//                         $set: {
//                             AllTotalFees: currentSessionTotalFees,
//                             AllPaidFees: 0,
//                             AllDueFees: currentSessionTotalFees,
//                             allFeesConcession: checkFeesCollection.feesConcession,
//                         }
//                     },
//                     {
//                         new: true
//                     });
//                 if (updatedDocument && updated) {
//                     await feesConfirmationMessage(phone, school_name, session, student_name, feesAmount, date, receiptNo, class_name, admission_no, father_name, mother_name);
//                     return res.status(200).json(feesData);
//                 }
//             }
//             if (checkPreviousFeesCollection.dueFees == 0 && checkPreviousFeesCollection.AllPaidFees == 0) {
//                 if (feesAmount > checkFeesCollection.dueFees) {
//                     return res.status(400).json(`Paying fees amount is greater then due fees amount rupees ${checkFeesCollection.dueFees} of session ${session}!`);
//                 }
//                 const totalFees = checkFeesCollection.totalFees;
//                 const paidFees = checkFeesCollection.paidFees + feesAmount
//                 const dueFees = totalFees - paidFees;
//                 const AllPaidFees = checkFeesCollection.AllPaidFees + feesAmount;
//                 const AllDueFees = checkFeesCollection.AllDueFees - feesAmount;
//                 const feesData = {
//                     session: checkFeesCollection.session,
//                     receiptNo: receiptNo,
//                     totalFees: totalFees,
//                     feesConcession: checkFeesCollection.feesConcession,
//                     paidFees: paidFees,
//                     dueFees: dueFees,
//                     feesAmount: feesAmount,
//                     paymentDate: istDateTimeString,
//                     admissionFeesPayable: checkFeesCollection.admissionFeesPayable,
//                     admissionFees: checkFeesCollection.admissionFees,
//                     createdBy: createdBy
//                 }
//                 const deleteDocument = await FeesCollectionModel.findOneAndDelete({ adminId: adminId, studentId: studentId, session: previousSession });
//                 const updatedDocument = await FeesCollectionModel.findOneAndUpdate(
//                     {
//                         adminId: adminId,
//                         studentId: studentId,
//                         session: session
//                     },
//                     {
//                         $push: {
//                             installment: feesAmount,
//                             receipt: receiptNo,
//                             paymentDate: istDateTimeString,
//                             createdBy: createdBy
//                         },
//                         $set: {
//                             previousSessionFeesStatus: false,
//                             paidFees: paidFees,
//                             dueFees: dueFees,
//                             AllPaidFees: AllPaidFees,
//                             AllDueFees: AllDueFees
//                         }
//                     },
//                     {
//                         new: true // Return the updated document
//                     });
//                 if (updatedDocument && deleteDocument) {
//                     await feesConfirmationMessage(phone, school_name, session, student_name, feesAmount, date, receiptNo, class_name, admission_no, father_name, mother_name);
//                     return res.status(200).json(feesData);
//                 }
//             }
//             if (feesAmount > checkPreviousFeesCollection.dueFees) {
//                 return res.status(400).json(`Paying fees amount is greater then due fees amount rupees ${checkPreviousFeesCollection.dueFees} of session ${session}!`);
//             }
//             const updatedDocument = await FeesCollectionModel.findOneAndUpdate(
//                 {
//                     adminId: adminId,
//                     studentId: studentId,
//                     session: previousSession
//                 },
//                 {
//                     $push: {
//                         installment: feesAmount,
//                         receipt: receiptNo,
//                         paymentDate: istDateTimeString,
//                         createdBy: createdBy
//                     },
//                     $set: {
//                         paidFees: paidFees,
//                         dueFees: dueFees,
//                         AllPaidFees: AllPaidFees,
//                         AllDueFees: AllDueFees
//                     }
//                 },
//                 {
//                     new: true
//                 });
//             const updated = await FeesCollectionModel.findOneAndUpdate(
//                 {
//                     adminId: adminId,
//                     studentId: studentId,
//                     session: session
//                 },
//                 {
//                     $set: {
//                         AllPaidFees: AllPaidFees,
//                         AllDueFees: AllDueFees
//                     }
//                 },
//                 {
//                     new: true
//                 }
//             );
//             if (updatedDocument && updated) {
//                 await feesConfirmationMessage(phone, school_name, session, student_name, feesAmount, date, receiptNo, class_name, admission_no, father_name, mother_name);
//                 return res.status(200).json(feesData);
//             }

//         }
//     } catch (error) {
//         return res.status(500).json('Internal Server Error!');
//     }
// }

module.exports = {
    GetStudentFeesCollectionBySession,
    GetAllStudentFeesCollectionByClass,
    GetSingleStudentFeesCollectionByStudentId,
    GetSingleStudentFeesCollectionById,
    GetPayableSingleStudentFeesCollectionById,
    CreateFeesCollection,
    // CreateAdmissionFeesCollection

}