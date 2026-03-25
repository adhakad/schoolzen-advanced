'use strict';
const SchoolModel = require('../models/school');
const StudentModel = require('../models/student');
const FeesStructureModel = require('../models/fees-structure');
const FeesCollectionModel = require('../models/fees-collection');
const ReminderLogsModel = require('../models/whatsapp-message/reminder-logs');
const ReminderFilterModel = require('../models/whatsapp-message/reminder-filter');
const { DateTime } = require('luxon');
const { getClassDisplayName } = require('../helpers/format-class-name');
const { toTitleCase } = require('../helpers/titlecase');
const { sendManualFeeReminder } = require('../services/send-whatsapp-message');
const { checkWhatsappLimit, updateWhatsappUsage } = require('../services/whatsapp-message-wallet');


let GetAllReminderFilterByClass = async (req, res, next) => {
    let adminId = req.params.id;
    let className = req.params.class;
    try {

        const reminderFilter = await ReminderFilterModel.find({ adminId: adminId, class: className });
        if (!reminderFilter) {
            return res.status(404).json({ errorMsg: 'Reminder filter not found!' })
        }
        return res.status(200).json({ reminderFilterList: reminderFilter });
    } catch (error) {
        return res.status(500).json({ errorMsg: 'Internal Server Error!' });
    }
}
const StudentFilter = async (req, res) => {
    try {
        let {
            adminId,
            minPercentage,
            lastPaymentDays,
            lastReminderDays,
            class: className,
            paymentLastDate,
        } = req.body;

        const now = new Date();

        if (paymentLastDate) {
            // Regex to match dd/MM/yyyy format strictly
            const ddmmyyyyPattern = /^\d{2}\/\d{2}\/\d{4}$/;

            if (!ddmmyyyyPattern.test(paymentLastDate)) {
                // Only run parsing logic if it's NOT already dd/MM/yyyy
                let parsedDate = DateTime.fromFormat(paymentLastDate, 'dd/MM/yyyy');
                if (!parsedDate.isValid) {
                    paymentLastDate = DateTime.fromISO(paymentLastDate).toFormat("dd/MM/yyyy");
                }
            }
        }
        const schoolInfo = await SchoolModel.findOne({ adminId });
        if (!schoolInfo) {
            return res.status(404).json({ errorMsg: "School detail not found!" });
        }
        const students = await StudentModel.find({ adminId, class: className }).lean();
        if (!students.length) {
            return res.status(404).json({
                errorMsg: "No students found in the selected class."
            });
        }
        const singleFeesStr = await FeesStructureModel.findOne({ adminId: adminId, class: className });
        if (!singleFeesStr) {
            return res.status(404).json({ errorMsg: 'Fee Structure not found!' });
        }
        const singleFeesCollection = await FeesCollectionModel.findOne({ adminId: adminId, class: className });
        if (!singleFeesCollection) {
            return res.status(404).json({ errorMsg: 'Student fee record not found!' });
        }

        const studentIds = students.map(s => s._id);
        const feesData = await FeesCollectionModel.find({
            adminId,
            studentId: { $in: studentIds }
        }).lean();
        const reminderLogs = await ReminderLogsModel.find({
            adminId,
            studentId: { $in: studentIds }
        }).lean();

        const reminderMap = new Map();
        reminderLogs.forEach(log => {
            reminderMap.set(log.studentId.toString(), log);
        });

        const feesMap = new Map();
        feesData.forEach(fee => {
            feesMap.set(fee.studentId.toString(), fee);
        });

        let studentFilterData = [];
        let paidPercentage;
        for (const student of students) {
            const fee = feesMap.get(student._id.toString());

            if (minPercentage !== 0) {
                if (!fee || fee.AllDueFees <= 0 || fee.AllTotalFees === 0) continue;
                paidPercentage = Number(((fee.AllPaidFees / fee.AllTotalFees) * 100).toFixed(2));
                if (paidPercentage >= minPercentage) continue;
            } else if (minPercentage == 0) {
                if (!fee || fee.AllDueFees <= 0) continue;
                paidPercentage = Number(((fee.AllPaidFees / fee.AllTotalFees) * 100).toFixed(2));
            }

            const lastPay = fee?.paymentDate?.[fee.paymentDate.length - 1];
            if (lastPaymentDays > 0 && lastPay) {
                const daysSincePay = (now - new Date(lastPay)) / (1000 * 60 * 60 * 24);
                if (daysSincePay < lastPaymentDays) continue;
            }

            const reminder = reminderMap.get(student._id.toString());
            if (lastReminderDays > 0 && reminder?.lastMessageSentAt) {
                const daysSinceReminder = (now - new Date(reminder.lastMessageSentAt)) / (1000 * 60 * 60 * 24);
                if (daysSinceReminder < lastReminderDays) continue;
            }

            if (!student.parentsContact) continue;

            studentFilterData.push({
                studentId: student._id,
                adminId: student.adminId,
                fatherName: student.fatherName,
                motherName: student.motherName,
                name: student.name,
                dob: student.dob,
                admissionNo: student.admissionNo,
                parentsContact: student.parentsContact,
                paidPercentage: paidPercentage,
                paidAmount: fee.AllPaidFees,
                pendingAmount: fee.AllDueFees,
                totalFees: fee.AllTotalFees,
            });
        }

        // 🔹 अब चाहे data खाली हो या भरा, success response देंगे
        return res.status(200).json({
            filterStudentCount: studentFilterData.length,
            studentFilterData,
            allFilters: { className, minPercentage, lastPaymentDays, lastReminderDays, paymentLastDate },
            filterStatus: true,
            infoMsg: studentFilterData.length === 0
                ? "No students match the applied filters"
                : undefined
        });

    } catch (err) {
        console.error('Error in StudentFilter:', err);
        return res.status(500).json({ message: 'Server Error', errorMsg: err.message });
    }
};

const StudentFilterCreate = async (req, res) => {
    try {
        let {
            adminId,
            minPercentage,
            lastPaymentDays,
            lastReminderDays,
            paymentLastDate
        } = req.body;

        const className = req.body.class;

        const schoolInfo = await SchoolModel.findOne({ adminId });
        if (!schoolInfo) {
            return res.status(404).json({ errorMsg: "School detail not found!" });
        }
        const students = await StudentModel.find({ adminId, class: className }).lean();
        if (!students.length) {
            return res.status(404).json({
                errorMsg: "No students found in the selected class."
            });
        }
        const singleFeesStr = await FeesStructureModel.findOne({ adminId: adminId, class: className });
        if (!singleFeesStr) {
            return res.status(404).json({ errorMsg: 'Fee Structure not found!' });
        }
        const singleFeesCollection = await FeesCollectionModel.findOne({ adminId: adminId, class: className });
        if (!singleFeesCollection) {
            return res.status(404).json({ errorMsg: 'Student fee record not found!' });
        }
        const allFiltersData = {
            adminId: adminId,
            class: className,
            minPercentage: minPercentage,
            lastPaymentDays: lastPaymentDays,
            lastReminderDays: lastReminderDays,
            paymentLastDate
        }
        const createReminderFilter = await ReminderFilterModel.create(allFiltersData);
        return res.status(200).json({ message: 'Fee reminder filters created successfully' });
    } catch (err) {
        return res.status(500).json({ message: 'Server Error', errorMsg: err.message });
    }
};

const SendManualFeeReminder = async (req, res) => {
    const now = new Date();

    try {
        const { adminId, paymentLastDate, students } = req.body; // students = array of { studentId }
        const studentIds = students.map(s => s.studentId);
        const totalMessages = students.length; // 1 student = 1 message

        /** 🔹 Step 1: Check WhatsApp Message Limit */
        const limitCheck = await checkWhatsappLimit(adminId, totalMessages);
        if (!limitCheck.isAllowed) {
            return res.status(400).json({ errorMsg: limitCheck.message });
        }
        /** 1️⃣ School Info */
        const schoolInfo = await SchoolModel.findOne(
            { adminId },
            "schoolName affiliationNumber street city district state"
        );
        if (!schoolInfo) {
            return res.status(404).json({ errorMsg: "School detail not found!" });
        }

        /** 2️⃣ Fetch Required Data in Bulk (Only Given IDs) */
        const [studentList, feeRecords, reminderLogs] = await Promise.all([
            StudentModel.find(
                { adminId, _id: { $in: studentIds } },
                "name fatherName parentsContact class"
            ),
            FeesCollectionModel.find(
                { adminId, studentId: { $in: studentIds } },
                "studentId AllDueFees AllTotalFees AllPaidFees paymentDate"
            ),
            ReminderLogsModel.find(
                { adminId, studentId: { $in: studentIds } },
                "studentId lastMessageSentAt"
            )
        ]);

        /** 3️⃣ Quick Lookup Maps */
        const feeMap = new Map(feeRecords.map(fee => [fee.studentId.toString(), fee]));
        const reminderMap = new Map(reminderLogs.map(log => [log.studentId.toString(), log]));

        /** 4️⃣ Prepare WhatsApp Reminder Tasks */
        const whatsappTasks = [];
        const reminderUpdates = [];
        let sentCount = 0;
        let school_name = toTitleCase(`${schoolInfo.schoolName}, ${schoolInfo.city}, ${schoolInfo.state}`);
        for (const student of studentList) {
            const studentId = student._id.toString();
            const feeData = feeMap.get(studentId) || {};
            let className = getClassDisplayName(student.class);
            let name = toTitleCase(student.name);
            let fatherName = toTitleCase(student.fatherName);
            if (!student.parentsContact) {
                continue;
            }

            // Prepare a WhatsApp reminder sending task
            whatsappTasks.push(async () => {
                const { requestId, sentDateTime } = await sendManualFeeReminder(
                    student.parentsContact,
                    school_name,
                    fatherName,
                    feeData.AllDueFees,
                    name,
                    className,
                    paymentLastDate
                );

                if (requestId) {
                    sentCount++;
                    reminderUpdates.push({
                        updateOne: {
                            filter: { adminId, studentId },
                            update: {
                                $set: { lastMessageSentAt: now },
                                $push: {
                                    logs: {
                                        requestId,
                                        status: "sent",
                                        sentAt: sentDateTime
                                    }
                                }
                            },
                            upsert: true
                        }
                    });
                }
            });
        }

        /** 5️⃣ Send WhatsApp Reminders (Concurrency Limited) */
        await runWithConcurrencyLimit(whatsappTasks, 20);

        /** 6️⃣ Update Reminder Logs in Bulk */
        if (reminderUpdates.length > 0) {
            await ReminderLogsModel.bulkWrite(reminderUpdates);
        }

        if (sentCount > 0) {
            await updateWhatsappUsage(adminId, sentCount);
        }
        const reminderMessage = sentCount === 1
            ? `1  student has been successfully sent a whatsapp fee reminder.`
            : `${sentCount}  students have been successfully sent whatsapp fee reminders.`;

        return res.status(200).json({ message: reminderMessage });

    } catch (err) {
        return res.status(500).json({ message: "Server Error", errorMsg: err.message });
    }
};

/** Helper: Run async tasks with concurrency limit */
async function runWithConcurrencyLimit(tasks, limit) {
    const running = new Set();
    for (const task of tasks) {
        const promise = task().finally(() => running.delete(promise));
        running.add(promise);
        if (running.size >= limit) {
            await Promise.race(running);
        }
    }
    await Promise.all(running);
}
let DeleteReminderFilter = async (req, res, next) => {
    try {
        const id = req.params.id;
        const deleteReminderFilter = await ReminderFilterModel.findByIdAndRemove(id);
        if (deleteReminderFilter) {
            return res.status(200).json({ message: 'Reminder filter deleted successfully' });
        }
    } catch (error) {
        return res.status(500).json({ errorMsg: 'Internal Server Error!' });
    }
}



module.exports = {
    GetAllReminderFilterByClass,
    StudentFilter,
    StudentFilterCreate,
    SendManualFeeReminder,
    DeleteReminderFilter,
}