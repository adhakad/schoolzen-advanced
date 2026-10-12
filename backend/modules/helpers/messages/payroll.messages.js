'use strict';

// The Payroll module's own messages (payroll/errors.md) — wording defined once.
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const rupees = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const notFound = () => 'This record no longer exists.';
const personNotFound = () => 'This person was not found!';

// Salary Groups
const groupNameRequired = () => 'Name is required.';
const amountInvalid = () => 'Enter a valid amount.';
const groupDuplicate = () => 'A salary group with this name already exists.';
const groupNotFound = () => 'The assigned salary group no longer exists!';
const groupInactive = () => 'This salary group is inactive and cannot be assigned!';
const groupInUseAssigned = (count) => `This salary group is assigned to ${plural(count, 'staff member', 'staff members')} and cannot be deleted!`;
const groupInUsePayroll = (count) => `This salary group has ${plural(count, 'generated payroll record', 'generated payroll records')} and cannot be deleted!`;
const deleteRequiresConfirm = () => 'Type DELETE to confirm.';

// Assign Salary
const selectionEmpty = () => 'Select at least one person.';
const assigned = (count) => `Salary assigned to ${plural(count, 'person', 'people')}.`;
const assignSkipped = (count) => `${plural(count, 'of the selected staff was', 'of the selected staff were')} skipped.`;

// Generate Payroll
const groupNotAssigned = () => 'No salary group is assigned to this person!';
const notEffectiveYet = () => 'This person\'s salary group is not effective until after this month.';
const noWorkingDays = () => 'No working days found for this month. Check the roster and attendance first!';
const runLocked = () => 'This payroll is locked. Unlock it before regenerating!';
const runAlreadyLocked = () => 'This payroll is already locked!';
const runNotLocked = () => 'This payroll is not locked!';
const unlockBlockedPayment = () => 'A payment has already been recorded against this payroll and it cannot be unlocked!';
const runNotFound = () => 'Payroll not found!';
const rowSkipped = (skipped) => `${plural(skipped, 'of the selected staff was', 'of the selected staff were')} skipped.`;
const generated = (count) => `Payroll generated for ${plural(count, 'person', 'people')}.`;
const queued = () => 'Payroll is being generated in the background.';
const locked = () => 'Payslip locked.';
const unlocked = () => 'Payslip unlocked.';
const midMonthWarning = (remaining, covered) =>
    `This month is still in progress — ${plural(remaining, 'day remains', 'days remain')}, of which ${covered} ${covered === 1 ? 'is' : 'are'} already covered by approved leave. Attendance for the remaining days is not yet final.`;
const jobNotFound = () => 'This job no longer exists.';

// Salary Payouts
const paymentAmountInvalid = () => 'Enter a valid payment amount.';
const paymentReferenceRequired = () => 'Enter a reference/UTR number for this payment mode.';
const paymentExceedsDue = (remaining) => `This payment exceeds the remaining balance of ${rupees(remaining)}!`;
const alreadyPaid = () => 'This payroll is already fully paid!';
const paymentRunNotLocked = () => 'Payment can only be recorded against a locked payroll!';
const paymentRecorded = () => 'Payment recorded — awaiting the employee\'s confirmation.';
const paymentNotFound = () => 'Payment not found!';
const paymentAlreadyActioned = (status) => `This payment has already been ${status}.`;
const disputeReasonRequired = () => 'Enter a reason for disputing this payment.';
const paymentConfirmed = () => 'Payment confirmed.';
const paymentDisputed = () => 'Payment disputed.';
const slipNoConfirmedPayment = () => 'No confirmed payment exists against this payroll yet. A salary slip can only be issued once a payment has been confirmed!';

module.exports = {
    rupees,
    notFound,
    personNotFound,
    groupNameRequired,
    amountInvalid,
    groupDuplicate,
    groupNotFound,
    groupInactive,
    groupInUseAssigned,
    groupInUsePayroll,
    deleteRequiresConfirm,
    selectionEmpty,
    assigned,
    assignSkipped,
    groupNotAssigned,
    notEffectiveYet,
    noWorkingDays,
    runLocked,
    runAlreadyLocked,
    runNotLocked,
    unlockBlockedPayment,
    runNotFound,
    rowSkipped,
    generated,
    queued,
    locked,
    unlocked,
    midMonthWarning,
    jobNotFound,
    paymentAmountInvalid,
    paymentReferenceRequired,
    paymentExceedsDue,
    alreadyPaid,
    paymentRunNotLocked,
    paymentRecorded,
    paymentNotFound,
    paymentAlreadyActioned,
    disputeReasonRequired,
    paymentConfirmed,
    paymentDisputed,
    slipNoConfirmedPayment,
};
