'use strict';
const BiometricMappingModel = require('../models/biometric-mapping');
// Read-only lookups for the person's name (needed by the WDMS employee record) — these
// files are never written to, per the "don't touch student/teacher models" constraint.
const StudentModel = require('../models/student');
const TeacherModel = require('../models/teacher');
const StaffModel = require('../models/staff');
const { createWdmsEmployee, updateWdmsEmployee } = require('../services/wdms-employee');

let GetAllBiometricMapping = async (req, res, next) => {
    const adminId = req.params.id;
    try {
        const biometricMappingList = await BiometricMappingModel.find({ adminId: adminId });
        return res.status(200).json(biometricMappingList);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetSingleBiometricMapping = async (req, res, next) => {
    try {
        const singleBiometricMapping = await BiometricMappingModel.findOne({ _id: req.params.id });
        return res.status(200).json(singleBiometricMapping);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let CreateBiometricMapping = async (req, res, next) => {
    const { adminId, personType, personId, wdmsEmpCode, cardNo } = req.body;
    try {
        const checkPersonMapping = await BiometricMappingModel.findOne({ adminId: adminId, personType: personType, personId: personId });
        if (checkPersonMapping) {
            return res.status(400).json('This person already has a biometric mapping!');
        }
        const checkEmpCode = await BiometricMappingModel.findOne({ adminId: adminId, wdmsEmpCode: wdmsEmpCode });
        if (checkEmpCode) {
            return res.status(400).json('This WDMS employee code is already mapped to another person!');
        }
        if (cardNo) {
            const checkCardNo = await BiometricMappingModel.findOne({ adminId: adminId, cardNo: cardNo });
            if (checkCardNo) {
                return res.status(400).json('This card number is already mapped to another person!');
            }
        }
        const biometricMappingData = {
            adminId: adminId,
            personType: personType,
            personId: personId,
            wdmsEmpCode: wdmsEmpCode,
            cardNo: cardNo,
        }
        const createBiometricMapping = await BiometricMappingModel.create(biometricMappingData);
        return res.status(200).json('Biometric mapping created successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let UpdateBiometricMapping = async (req, res, next) => {
    // personType/personId are treated as immutable identity fields — only the WDMS-side
    // identifiers are editable. To re-point a mapping to a different person, delete and recreate.
    try {
        const id = req.params.id;
        const biometricMappingData = {
            wdmsEmpCode: req.body.wdmsEmpCode,
            cardNo: req.body.cardNo,
        }
        const update = await BiometricMappingModel.findByIdAndUpdate(id, { $set: biometricMappingData }, { new: true });
        return res.status(200).json('Biometric mapping updated successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let DeleteBiometricMapping = async (req, res, next) => {
    try {
        const id = req.params.id;
        const dlt = await BiometricMappingModel.findByIdAndRemove(id);
        return res.status(200).json('Biometric mapping deleted successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

// "Assign Card" quick-action used from the Staff/Teacher/Student list tables — the modal
// only collects cardNo, so everything else is resolved server-side from personType/personId.
// Response shape is an object (not the plain-string pattern the rest of this file uses)
// because the frontend needs the wdmsSyncFailed flag to decide which toast to show —
// see CLAUDE.md's note that the two response styles aren't interchangeable; this handler
// is a deliberate, isolated exception to carry that extra flag.
let AssignCard = async (req, res, next) => {
    const { adminId, personType, personId, cardNo } = req.body;
    try {
        // STEP 1 — upsert BiometricMapping locally first. This must always succeed on its
        // own, independent of whether WDMS is reachable — WDMS is a best-effort sync
        // target, not the source of truth for the mapping itself.
        // No separate emp_code field exists in the Assign Card modal, so personId (already
        // unique per admin+personType) doubles as the WDMS emp_code.
        const wdmsEmpCode = personId;
        const mapping = await BiometricMappingModel.findOneAndUpdate(
            { adminId: adminId, personType: personType, personId: personId },
            { $set: { cardNo: cardNo, wdmsEmpCode: wdmsEmpCode } },
            { upsert: true, new: true }
        );

        // Resolve the person's name for the WDMS employee record.
        let personName = '';
        if (personType === 'staff') {
            const staff = await StaffModel.findOne({ _id: personId });
            personName = staff ? staff.name : '';
        } else if (personType === 'teacher') {
            const teacher = await TeacherModel.findOne({ _id: personId });
            personName = teacher ? teacher.name : '';
        } else if (personType === 'student') {
            const student = await StudentModel.findOne({ _id: personId });
            personName = student ? student.name : '';
        }

        // STEP 2 — sync to WDMS. Deliberately isolated in its own try/catch: a WDMS
        // failure (device offline, bad creds, etc.) must never fail or roll back the
        // local save from STEP 1 — it only flips wdmsSyncFailed for the frontend's toast.
        let wdmsSyncFailed = false;
        try {
            const person = { name: personName, empCode: wdmsEmpCode, cardNo: cardNo };
            if (mapping.wdmsId) {
                await updateWdmsEmployee(mapping.wdmsId, person);
            } else {
                const wdmsEmployee = await createWdmsEmployee(person);
                await BiometricMappingModel.findByIdAndUpdate(mapping._id, { $set: { wdmsId: wdmsEmployee.id } });
            }
        } catch (wdmsError) {
            wdmsSyncFailed = true;
        }

        return res.status(200).json({ successMsg: 'Card assigned successfully.', wdmsSyncFailed: wdmsSyncFailed });
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

// Bulk "Assign Card" via CSV — mirrors CreateBulkStudentRecord's convention of taking a
// pre-parsed array in the JSON body rather than an uploaded file: the CSV is parsed
// client-side (see student.component.ts's Excel-import pattern) and posted here as
// `records: [{code, cardNo}, ...]`. Matching field per personType:
//   staff   -> Staff.empCode        (no other stable, human-entered code exists on Staff)
//   teacher -> Teacher.teacherUserId
//   student -> Student.admissionNo
let BulkAssignCard = async (req, res, next) => {
    const { adminId, personType, records } = req.body;
    try {
        let successCount = 0;
        let failed = []; // { code, cardNo, reason }

        for (const record of records) {
            const code = (record.code || '').toString().trim();
            const cardNo = (record.cardNo || '').toString().trim();

            if (!code || !cardNo) {
                failed.push({ code: code || '(blank)', cardNo: cardNo || '(blank)', reason: 'Missing code or card number' });
                continue;
            }

            let personDoc = null;
            if (personType === 'staff') {
                personDoc = await StaffModel.findOne({ adminId: adminId, empCode: code });
            } else if (personType === 'teacher') {
                personDoc = await TeacherModel.findOne({ adminId: adminId, teacherUserId: Number(code) });
            } else if (personType === 'student') {
                personDoc = await StudentModel.findOne({ adminId: adminId, admissionNo: Number(code) });
            }

            if (!personDoc) {
                failed.push({ code: code, cardNo: cardNo, reason: `No ${personType} found with code "${code}"` });
                continue;
            }

            const personId = personDoc._id.toString();
            const wdmsEmpCode = personId;

            try {
                // STEP 1 — local save, awaited, always happens before any WDMS attempt.
                const mapping = await BiometricMappingModel.findOneAndUpdate(
                    { adminId: adminId, personType: personType, personId: personId },
                    { $set: { cardNo: cardNo, wdmsEmpCode: wdmsEmpCode } },
                    { upsert: true, new: true }
                );
                successCount++;

                // STEP 2 — WDMS registration, fired per row without awaiting (true
                // fire-and-forget, unlike the single AssignCard flow) so a large CSV
                // doesn't block the response on hundreds of sequential WDMS calls.
                // Failures are only logged — they never turn a successful local save
                // into a failed row in the response.
                const person = { name: personDoc.name, empCode: wdmsEmpCode, cardNo: cardNo };
                if (mapping.wdmsId) {
                    updateWdmsEmployee(mapping.wdmsId, person).catch((wdmsError) => {
                        console.error(`WDMS bulk sync failed for ${personType} ${personId}:`, wdmsError.message);
                    });
                } else {
                    createWdmsEmployee(person).then((wdmsEmployee) => {
                        return BiometricMappingModel.findByIdAndUpdate(mapping._id, { $set: { wdmsId: wdmsEmployee.id } });
                    }).catch((wdmsError) => {
                        console.error(`WDMS bulk sync failed for ${personType} ${personId}:`, wdmsError.message);
                    });
                }
            } catch (rowError) {
                failed.push({ code: code, cardNo: cardNo, reason: 'Failed to save mapping' });
            }
        }

        return res.status(200).json({ successCount: successCount, failedCount: failed.length, failed: failed });
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    GetAllBiometricMapping,
    GetSingleBiometricMapping,
    CreateBiometricMapping,
    UpdateBiometricMapping,
    DeleteBiometricMapping,
    AssignCard,
    BulkAssignCard,
}
