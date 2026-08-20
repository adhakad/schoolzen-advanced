'use strict';
const BiometricMappingModel = require('../models/biometric-mapping');
// Read-only lookups for the person's name (needed by the WDMS employee record) — these
// files are never written to, per the "don't touch student/teacher models" constraint.
const StudentModel = require('../models/student');
const TeacherModel = require('../models/teacher');
const StaffModel = require('../models/staff');
const { createWdmsEmployee, updateWdmsEmployee, resyncWdmsDevices } = require('../services/wdms-employee');
// Reused rather than re-queried: this is already the canonical "which terminals belong to
// this school and are usable" lookup, and Phase 5's isolation contract says Device is only
// ever read by assignedSchoolId + terminalSn.
const { getSchoolTerminalSns } = require('../services/punch-ingest');

const resolvePersonName = async (personType, personId) => {
    if (personType === 'staff') {
        const staff = await StaffModel.findOne({ _id: personId });
        return staff ? staff.name : '';
    }
    if (personType === 'teacher') {
        const teacher = await TeacherModel.findOne({ _id: personId });
        return teacher ? teacher.name : '';
    }
    if (personType === 'student') {
        const student = await StudentModel.findOne({ _id: personId });
        return student ? student.name : '';
    }
    return '';
}

/**
 * Push one person's WDMS employee record, then tell the school's terminals to pull it.
 *
 * Shared by AssignCard and the standalone Resync action so the two can never drift — a
 * resync that built its payload differently from the assign would be worse than no resync.
 *
 * Isolated from every local write on purpose: WDMS is a best-effort sync target, not the
 * source of truth, so this returning false must never roll back or fail a Schoolzen save.
 *
 * @returns {Promise<Boolean>} false if anything WDMS-side failed
 */
const syncPersonToWdms = async (adminId, mapping) => {
    try {
        const personName = await resolvePersonName(mapping.personType, mapping.personId);
        const person = {
            name: personName,
            empCode: mapping.wdmsEmpCode,
            cardNo: mapping.cardNo,
            verifyMode: mapping.verifyMode,
        };

        if (mapping.wdmsId) {
            await updateWdmsEmployee(mapping.wdmsId, person);
        } else {
            const wdmsEmployee = await createWdmsEmployee(person);
            // Cached so the next card change PATCHes this record instead of creating a
            // duplicate employee in WDMS.
            await BiometricMappingModel.findByIdAndUpdate(mapping._id, { $set: { wdmsId: wdmsEmployee.id } });
        }

        // The employee now exists in WDMS, but the terminal still holds the old copy until
        // it is told to pull. Failure here is reported but does not undo the employee
        // write — the next resync (manual or from the next card change) picks it up.
        const terminalSns = await getSchoolTerminalSns(adminId);
        return await resyncWdmsDevices(terminalSns);
    } catch (wdmsError) {
        console.error('WDMS person sync failed:', wdmsError.message);
        return false;
    }
}

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
        console.log('cardNo type:', typeof cardNo, 'value:', cardNo);
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
    const { adminId, personType, personId, cardNo, verifyMode } = req.body;
    try {
        // STEP 1 — upsert BiometricMapping locally first. This must always succeed on its
        // own, independent of whether WDMS is reachable — WDMS is a best-effort sync
        // target, not the source of truth for the mapping itself.
        // No separate emp_code field exists in the Assign Card modal, so personId (already
        // unique per admin+personType) doubles as the WDMS emp_code.
        const wdmsEmpCode = personId;
        const mappingData = { cardNo: cardNo, wdmsEmpCode: wdmsEmpCode };
        // `!= null` not truthiness — verify mode 0 (Auto) is a real setting. Omitted
        // entirely when the form did not send one, so the model default (4, Card Only)
        // applies on insert and an existing value is left alone on update.
        if (verifyMode != null && verifyMode !== '') mappingData.verifyMode = Number(verifyMode);

        const mapping = await BiometricMappingModel.findOneAndUpdate(
            { adminId: adminId, personType: personType, personId: personId },
            { $set: mappingData },
            { upsert: true, new: true }
        );

        // STEP 2 — push to WDMS and resync the terminals. Never throws; a WDMS failure
        // (device offline, bad creds, wrong resync path) only flips wdmsSyncFailed for the
        // frontend's toast and never rolls back STEP 1.
        const wdmsSyncFailed = !(await syncPersonToWdms(adminId, mapping));

        return res.status(200).json({ successMsg: 'Card assigned successfully.', wdmsSyncFailed: wdmsSyncFailed });
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// POST /resync   { adminId, personType, personId, verifyMode? }
// On-demand "push this person to the machines again", from the row action or the Assign
// Card modal. The reason it exists: WDMS syncing is best-effort by design, so an assign
// that happened while a device was offline leaves a card that does not open the door and
// no way to retry short of re-entering the number.
//
// Doubles as the verify-mode change endpoint — sending a new verifyMode here persists it
// and pushes it in one action.
// ---------------------------------------------------------------------------
let ResyncPerson = async (req, res, next) => {
    const { adminId, personType, personId, verifyMode } = req.body;
    try {
        if (!adminId || !personType || !personId) {
            return res.status(400).json('School, person type and person are required!');
        }

        // No upsert here, unlike AssignCard: with no mapping there is no card and no emp
        // code, so there is nothing to push. Say so rather than registering a blank
        // employee in WDMS.
        const query = { adminId: adminId, personType: personType, personId: personId };
        if (verifyMode != null && verifyMode !== '') {
            const mapping = await BiometricMappingModel.findOneAndUpdate(
                query, { $set: { verifyMode: Number(verifyMode) } }, { new: true }
            );
            if (!mapping) return res.status(404).json('Assign a card to this person first!');
            const failed = !(await syncPersonToWdms(adminId, mapping));
            return res.status(200).json({ successMsg: 'Resynced to device.', wdmsSyncFailed: failed });
        }

        const mapping = await BiometricMappingModel.findOne(query);
        if (!mapping) return res.status(404).json('Assign a card to this person first!');

        const wdmsSyncFailed = !(await syncPersonToWdms(adminId, mapping));
        return res.status(200).json({ successMsg: 'Resynced to device.', wdmsSyncFailed: wdmsSyncFailed });
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
        // Every in-flight WDMS employee write, so the single resync below can wait for all
        // of them to settle before telling the terminals to pull.
        const wdmsWrites = [];

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
                const person = {
                    name: personDoc.name,
                    empCode: wdmsEmpCode,
                    cardNo: cardNo,
                    verifyMode: mapping.verifyMode,
                };
                if (mapping.wdmsId) {
                    wdmsWrites.push(updateWdmsEmployee(mapping.wdmsId, person).catch((wdmsError) => {
                        console.error(`WDMS bulk sync failed for ${personType} ${personId}:`, wdmsError.message);
                    }));
                } else {
                    wdmsWrites.push(createWdmsEmployee(person).then((wdmsEmployee) => {
                        return BiometricMappingModel.findByIdAndUpdate(mapping._id, { $set: { wdmsId: wdmsEmployee.id } });
                    }).catch((wdmsError) => {
                        console.error(`WDMS bulk sync failed for ${personType} ${personId}:`, wdmsError.message);
                    }));
                }
            } catch (rowError) {
                failed.push({ code: code, cardNo: cardNo, reason: 'Failed to save mapping' });
            }
        }

        // ONE resync for the whole CSV, not one per row — a 400-row import would otherwise
        // ask the terminals to re-pull 400 times. Chained off the employee writes so it
        // cannot fire before the records it is meant to publish exist, and deliberately not
        // awaited so the response returns as soon as the local saves are done.
        if (wdmsWrites.length > 0) {
            Promise.allSettled(wdmsWrites)
                .then(() => getSchoolTerminalSns(adminId))
                .then((terminalSns) => resyncWdmsDevices(terminalSns))
                .catch((resyncError) => {
                    console.error('WDMS bulk resync failed:', resyncError.message);
                });
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
    ResyncPerson,
}
