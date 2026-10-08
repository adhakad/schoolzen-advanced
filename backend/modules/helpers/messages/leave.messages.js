'use strict';

// The Leave module's own messages (leave/errors.md) — wording defined once.
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

const notFound = () => 'This record no longer exists.';
const requestNotFound = () => 'This request no longer exists.';
const personNotFound = () => 'This person could not be found.';
const sessionMissing = () => 'No academic session is active — set one in Settings first.';

// Leave Create
const typeNameRequired = () => 'Name is required.';
const typeDaysInvalid = () => 'Enter a valid number of days.';
const typeDuplicate = () => 'A leave type with this name already exists.';
const typeNarrowBlocked = () => 'This leave type is already used by another person type and cannot be narrowed.';
const typeInUse = (assignments, requests) => {
    const parts = [];
    if (assignments) parts.push(plural(assignments, 'assignment', 'assignments'));
    if (requests) parts.push(plural(requests, 'request', 'requests'));
    return `This leave type is used by ${parts.join(' and ')} and cannot be deleted.`;
};
const typeNotFound = () => 'One or more leave types were not found.';
const typeInactive = () => 'This leave type is inactive.';
const typeNotApplicable = (personType) => `This leave type does not apply to a ${personType}.`;
const deleteRequiresConfirm = () => 'Type DELETE to confirm.';

// Requests
const dateRangeInvalid = () => 'Choose a valid date range.';
const pastDateBlocked = () => 'Cannot apply leave for past dates.';
const rangeEmpty = () => 'This date range has no working days to grant.';
const overlap = () => 'This person already has a leave request covering these dates.';
const balanceExceeded = (typeName, left, requested) =>
    `Not enough ${typeName} balance: ${plural(Math.max(left, 0), 'day', 'days')} left, ${requested} requested.`;
const limitMissing = () => 'This person has not been assigned this leave type — assign it first before approving.';
const notPending = (status) => `This request is already ${String(status).toLowerCase()}.`;
const alreadyActioned = () => 'This request was already actioned a moment ago.';
const notCancellable = () => 'Only an approved leave can be cancelled.';
const alreadyCompleted = () => 'This leave has already been completed and cannot be cancelled.';
const onlyRejectedDeletable = () => 'Only a rejected request can be deleted.';

const applied = () => 'Leave request submitted.';
const approved = (days) => `Leave approved — ${plural(days, 'day', 'days')} marked on the attendance register.`;
const rejected = () => 'Leave request rejected.';
const cancelled = () => 'Leave taken back — the days are back in their balance.';
const deleted = () => 'Leave request deleted.';

// Assign
const selectionEmpty = () => 'Select at least one leave type and one person.';
const limitBelowUsed = (used) => `This person has already taken ${plural(used, 'day', 'days')} — the limit cannot be lower.`;
const overridesExist = (count) =>
    `${plural(count, 'student has', 'students have')} their own limit in this class. Overwrite them with the class value?`;
const staffAssigned = (assigned, skipped) => skipped
    ? `Leave limit set for ${plural(assigned, 'entry', 'entries')}; ${skipped} already set and left unchanged.`
    : `Leave limit set for ${plural(assigned, 'entry', 'entries')}.`;
const classAssigned = (classes, students) =>
    `Leave limit set for ${plural(classes, 'class', 'classes')} (${plural(students, 'student', 'students')}).`;
const limitSaved = () => 'Leave limit saved.';

module.exports = {
    notFound,
    requestNotFound,
    personNotFound,
    sessionMissing,
    typeNameRequired,
    typeDaysInvalid,
    typeDuplicate,
    typeNarrowBlocked,
    typeInUse,
    typeNotFound,
    typeInactive,
    typeNotApplicable,
    deleteRequiresConfirm,
    dateRangeInvalid,
    pastDateBlocked,
    rangeEmpty,
    overlap,
    balanceExceeded,
    limitMissing,
    notPending,
    alreadyActioned,
    notCancellable,
    alreadyCompleted,
    onlyRejectedDeletable,
    applied,
    approved,
    rejected,
    cancelled,
    deleted,
    selectionEmpty,
    limitBelowUsed,
    overridesExist,
    staffAssigned,
    classAssigned,
    limitSaved,
};
