'use strict';

// The Fees module's own messages (fees/errors.md) — wording defined once.
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const rupees = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Fee Structure
const particularInvalid = () => 'Enter a name and a valid amount for every fee particular.';
const particularsRequired = () => 'Add at least one fee particular.';
const structureDuplicate = () => 'A fee structure already exists for this class/stream/group this session — edit it instead.';
const structureNotFound = () => 'This fee structure no longer exists.';
const structureInUse = (count) => `${plural(count, 'student fee record', 'student fee records')} already ${count === 1 ? 'has' : 'have'} payments or carried dues against this structure — it can't be deleted once fees have been collected against it. Edit it instead.`;
const structureBelowPaid = (count) => `${plural(count, 'student has', 'students have')} already paid more than this new total — lower it no further than what's been paid.`;
const streamRequired = () => 'Choose a stream for this class.';
const placementInvalid = () => 'This class, stream or group is not set up in Academic Setup.';
const deleteRequiresConfirm = () => 'Type DELETE to confirm.';

// Fees / Collect
const paymentAmountInvalid = () => 'Enter a valid payment amount.';
const paymentExceedsDue = (due) => `This amount is more than the ${rupees(due)} still due.`;
const nothingDue = () => 'Nothing is due for this student.';
const feeRecordNotFound = () => 'This student has no fee record for the current session — check their enrollment.';
const paymentAlreadyRecorded = () => 'This payment was already recorded — refresh to see the latest balance.';
const paymentNotFound = () => 'This receipt no longer exists.';
const studentNotFound = () => 'Student not found.';
const sessionNotFound = () => 'This academic session does not exist yet.';
const collected = (amount) => `${rupees(amount)} collected.`;

// Concession (waiver)
const concessionExceedsFee = (gross) => `Concession can't be more than the total fee of ${rupees(gross)}.`;
const concessionBelowPaid = (max) => `This student has already paid more than the fee after that concession — the concession can be at most ${rupees(max)}.`;
const concessionReasonRequired = () => 'Give a reason for this concession.';
const concessionUpdated = () => 'Concession updated.';

// Fee Reminder
const reminderClassRequired = () => 'Choose a class.';
const reminderFieldInvalid = () => 'Enter a valid number.';
const reminderPercentInvalid = () => 'Enter a percentage between 0 and 100.';
const reminderNotFound = () => 'This reminder filter no longer exists.';
const reminderRecipientsRequired = () => 'Select at least one student to send to.';
const reminderQueued = (count) => `Sending reminders to ${plural(count, 'student', 'students')}…`;
const reminderStale = (count) => `${plural(count, 'recipient was', 'recipients were')} skipped — their fee status or contact number changed since you reviewed this list.`;
const notificationFailed = (count) => `Couldn't send to ${plural(count, 'recipient', 'recipients')} — they'll be retried automatically.`;
const filterDeleted = () => 'This only removed the saved filter — no reminders sent or student data were affected.';
const jobNotFound = () => 'This job no longer exists.';

module.exports = {
    rupees,
    particularInvalid,
    particularsRequired,
    structureDuplicate,
    structureNotFound,
    structureInUse,
    structureBelowPaid,
    streamRequired,
    placementInvalid,
    deleteRequiresConfirm,
    paymentAmountInvalid,
    paymentExceedsDue,
    nothingDue,
    feeRecordNotFound,
    paymentAlreadyRecorded,
    paymentNotFound,
    studentNotFound,
    sessionNotFound,
    collected,
    concessionExceedsFee,
    concessionBelowPaid,
    concessionReasonRequired,
    concessionUpdated,
    reminderClassRequired,
    reminderFieldInvalid,
    reminderPercentInvalid,
    reminderNotFound,
    reminderRecipientsRequired,
    reminderQueued,
    reminderStale,
    notificationFailed,
    filterDeleted,
    jobNotFound,
};
