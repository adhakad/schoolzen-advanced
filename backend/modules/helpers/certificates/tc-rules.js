'use strict';
const { REASON_LABELS, CONDUCT_LABELS } = require('./tc-fields');

// Transfer Certificate rules — pure functions, no database (scripts/test-certificates-v2.js).

const SERIAL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/-]{0,28}\d$/;
const MAX_WORKING_DAYS = 365;

/** "TC-2026-0048" → "TC-2026-0049": the trailing number +1, its zero-padding kept. */
const nextSerial = (serial) => {
    const match = /^(.*?)(\d+)$/.exec(String(serial || ''));
    if (!match) return null;
    const next = String(Number(match[2]) + 1);
    return match[1] + next.padStart(match[2].length, '0');
};

/** A serial must end in a number (that's what increments) and stay printable. */
const isValidSerial = (serial) => SERIAL_PATTERN.test(String(serial || '').trim());

const defaultSerial = (year) => `TC-${year}-0001`;

/** TC_ATTENDANCE_RANGE_INVALID: present ≤ working ≤ 365, both non-negative. */
const attendanceInRange = (workingDays, presentDays) => Number.isFinite(workingDays) && Number.isFinite(presentDays)
    && workingDays >= 0 && presentDays >= 0 && workingDays <= MAX_WORKING_DAYS && presentDays <= workingDays;

/**
 * Pending fees block an issue unless the caller holds 'fees-waiver' AND explicitly
 * acknowledged the dues (TC_FEES_PENDING).
 * @returns {{ allowed: boolean, override: boolean, canOverride: boolean }}
 */
const feesGate = (totalDue, canWaive, acknowledged) => {
    if (!(Number(totalDue) > 0)) return { allowed: true, override: false, canOverride: Boolean(canWaive) };
    if (canWaive && acknowledged) return { allowed: true, override: true, canOverride: true };
    return { allowed: false, override: false, canOverride: Boolean(canWaive) };
};

const pad2 = (n) => String(n).padStart(2, '0');
/** A Date → "dd/mm/yyyy" by its UTC calendar day (dates are stored as UTC midnight). */
const ddmmyyyy = (date) => {
    if (!date) return null;
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const ORDINAL_ONES = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
    'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth'];
const ORDINAL_TENS = { 20: 'Twentieth', 30: 'Thirtieth' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
    'November', 'December'];

const belowHundred = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`);
const yearInWords = (year) => [
    Math.floor(year / 1000) ? `${ONES[Math.floor(year / 1000)]} Thousand` : '',
    Math.floor((year % 1000) / 100) ? `${ONES[Math.floor((year % 1000) / 100)]} Hundred` : '',
    belowHundred(year % 100),
].filter(Boolean).join(' ');
const dayOrdinal = (day) => {
    if (day < 20) return ORDINAL_ONES[day];
    if (ORDINAL_TENS[day]) return ORDINAL_TENS[day];
    return `${TENS[Math.floor(day / 10)]} ${ORDINAL_ONES[day % 10]}`;
};

/** 2013-03-12 → "12/03/2013 (Twelfth March, Two Thousand Thirteen)" — field 4. */
const dobWithWords = (date) => {
    const text = ddmmyyyy(date);
    if (!text) return null;
    const d = new Date(date);
    return `${text} (${dayOrdinal(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}, ${yearInWords(d.getUTCFullYear())})`;
};

/** Only the last four digits ever print: "XXXX-XXXX-4821". */
const maskAadhar = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 4 ? `XXXX-XXXX-${digits.slice(-4)}` : null;
};

const promotionText = (qualified, nextClassName) => (qualified
    ? (nextClassName ? `Yes — to ${nextClassName}` : 'Yes')
    : 'No');

/**
 * The frozen printable values (generate-tc.md: "a TC reflects the record AS OF issuing").
 * Returns a NEW plain object of copied primitives — later edits to `profile` never reach it.
 *
 * @param {Object} profile    v2 Student fields
 * @param {Object} placement  { className, streamName, sectionName, nextClassName, subjects: string[] }
 * @param {Object} inputs     { dateOfLeaving, qualifiedForPromotion, reasonForLeaving, generalConduct, remarks }
 * @param {Object} attendance { workingDays, presentDays }
 */
const buildSnapshot = (profile, placement, inputs, attendance) => {
    const classText = [placement.className, placement.streamName].filter(Boolean).join(' ');
    return {
        admissionNo: profile.admissionNo != null ? String(profile.admissionNo) : null,
        name: profile.name || null,
        motherName: profile.motherName || null,
        fatherName: profile.fatherName || null,
        dob: dobWithWords(profile.dob),
        aadharNumber: maskAadhar(profile.aadharNumber),
        samagraId: profile.samagraId || null,
        nationality: profile.nationality || null,
        category: profile.category || null,
        firstAdmissionDate: ddmmyyyy(profile.doa),
        classLastStudied: classText
            ? `${classText}${placement.sectionName ? ` (Section ${placement.sectionName})` : ''}`
            : null,
        // Field 11 is derived from the promotion decision until Examination results exist.
        lastExamResult: placement.className
            ? `${placement.className} — ${inputs.qualifiedForPromotion ? 'Passed' : 'Failed'}`
            : null,
        subjects: (placement.subjects || []).length
            ? `${placement.subjects.join(', ')}${placement.streamName ? ` (${placement.streamName})` : ''}`
            : null,
        promotion: promotionText(inputs.qualifiedForPromotion, placement.nextClassName),
        workingDays: attendance.workingDays,
        presentDays: attendance.presentDays,
        issueDate: ddmmyyyy(inputs.dateOfLeaving),
        reason: REASON_LABELS[inputs.reasonForLeaving] || null,
        conduct: CONDUCT_LABELS[inputs.generalConduct] || null,
        remarks: inputs.remarks || null,
    };
};

module.exports = {
    MAX_WORKING_DAYS,
    nextSerial,
    isValidSerial,
    defaultSerial,
    attendanceInRange,
    feesGate,
    ddmmyyyy,
    dobWithWords,
    maskAadhar,
    promotionText,
    buildSnapshot,
};
