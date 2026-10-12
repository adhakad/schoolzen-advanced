'use strict';

// The Certificates module's own messages (certificates/errors.md) — wording defined once.
const rupees = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const fieldInvalid = () => 'Enter a valid value using letters only.';
const attendanceRangeInvalid = () => 'Presence days cannot exceed working days, and working days cannot exceed 365.';
const notFound = () => 'This record no longer exists.';
const sessionNotFound = () => 'This academic session does not exist yet.';
const notEnrolled = () => 'This student has no class placement in the selected session.';
const alreadyIssued = () => 'A transfer certificate has already been issued for this student.';
const feesPending = (due) => `This student still has ${rupees(due)} in pending fees. Clear the dues in Fees before issuing a TC.`;
const feesPendingOverride = (due) => `This student still has ${rupees(due)} in pending fees. Confirm below to issue the TC anyway.`;
const serialInvalid = () => 'Enter a serial number that ends in a number, e.g. TC-2026-0048.';
const serialInUse = () => 'This serial number is already printed on an issued certificate — choose a later one.';
const serialChanged = () => 'Another certificate was just issued — refresh to see the current serial number and try again.';
const dateRequired = () => 'Choose the date of issue / leaving.';
const dateBeforeAdmission = () => 'The date of leaving cannot be before the date of admission.';
const dateInFuture = () => 'The date of leaving cannot be in the future.';
const cancelReasonRequired = () => 'Enter a reason for cancelling this certificate.';
const alreadyCancelled = () => 'This certificate is already cancelled.';
const structureSaved = () => 'TC structure saved.';
const issued = (serial) => `TC ${serial} issued.`;
const cancelled = (serial) => `TC ${serial} cancelled.`;

module.exports = {
    fieldInvalid,
    attendanceRangeInvalid,
    notFound,
    sessionNotFound,
    notEnrolled,
    alreadyIssued,
    feesPending,
    feesPendingOverride,
    serialInvalid,
    serialInUse,
    serialChanged,
    dateRequired,
    dateBeforeAdmission,
    dateInFuture,
    cancelReasonRequired,
    alreadyCancelled,
    structureSaved,
    issued,
    cancelled,
};
