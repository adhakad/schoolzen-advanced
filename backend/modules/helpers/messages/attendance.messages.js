'use strict';

// The Attendance module's own messages (attendance/errors.md) — wording defined once.
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

const notFound = () => 'This record no longer exists.';
const personNotFound = () => 'This person could not be found.';
const shiftNotFound = () => 'The selected shift no longer exists — refresh and try again.';
const shiftDuplicate = () => 'A shift with this name already exists.';
const shiftTimeRangeInvalid = () => 'Start time must be before end time.';
const shiftInUse = (people, classes) => {
    const parts = [];
    if (people) parts.push(plural(people, 'person', 'people'));
    if (classes) parts.push(plural(classes, 'class', 'classes'));
    return `This shift is assigned to ${parts.join(' and ')} — reassign them first.`;
};
const shiftInactive = () => 'This shift is inactive — activate it before assigning it.';

const statusInvalid = () => 'Status must be Present, Late, HalfDay, Absent, Leave, or Holiday.';
const halfDayNotApplicable = () => 'Half Day does not apply to students.';
const manualTimeRangeInvalid = () => 'Out time cannot be before in time.';
const dateRangeInvalid = () => 'The start date must be before the end date.';
const dateRangeTooLong = () => 'Pick a date range of at most 62 days.';
const noMatchingDays = () => 'No days in that range match the chosen weekdays.';

const bulkRowsFailed = (failed, total) => `${failed} of ${total} selected people could not be updated.`;
const rosterAssigned = (people, days) => `Shift assigned to ${plural(people, 'person', 'people')} across ${plural(days, 'day', 'days')}.`;
const rosterCleared = (people) => `Roster cleared for ${plural(people, 'person', 'people')}.`;
const classShiftAssigned = (count) => `Shift assigned to ${plural(count, 'class', 'classes')}.`;
const classShiftCleared = (count) => `Shift removed from ${plural(count, 'class', 'classes')}.`;
const deleteRequiresConfirm = () => 'Type DELETE to confirm.';

const syncRequiresConfirm = () => 'Confirm the sync before it runs.';
const syncAlreadyRunning = () => 'A sync is already running for this day!';
const syncQueued = () => 'Sync started — new punches will appear as they are processed.';
const syncNoDevices = () => 'No active devices are assigned to this school.';
const queueUnavailable = () => "Background processing is unavailable right now — please try again shortly.";
const manualSaved = () => 'Attendance updated.';
const sessionMissing = () => 'No academic session is active — set one in Settings first.';
// Manual marking (attendance-fix1.md §3d) — status marking, never "punch".
const markNotToday = () => "Attendance can only be marked for today — past and future dates can't be changed.";
const markDayOff = () => "This is a day off for this person, so attendance can't be marked.";
const markNoShift = () => 'No shift is assigned to this person today — assign one in Roster first.';
const markOutsideWindow = (from, to) => `Attendance can only be marked today between ${from} and ${to}.`;
const markDeviceRecorded = (at) => (at ? `Device punch recorded at ${at} — it can't be changed by hand.` : "A device punch is recorded for today — it can't be changed by hand.");
const marked = (name, status) => (status === 'Absent' ? `${name} marked Absent.` : `${name} marked ${status}.`);

module.exports = {
    notFound,
    personNotFound,
    shiftNotFound,
    shiftDuplicate,
    shiftTimeRangeInvalid,
    shiftInUse,
    shiftInactive,
    statusInvalid,
    halfDayNotApplicable,
    manualTimeRangeInvalid,
    dateRangeInvalid,
    dateRangeTooLong,
    noMatchingDays,
    bulkRowsFailed,
    rosterAssigned,
    rosterCleared,
    classShiftAssigned,
    classShiftCleared,
    deleteRequiresConfirm,
    syncRequiresConfirm,
    syncAlreadyRunning,
    syncQueued,
    syncNoDevices,
    queueUnavailable,
    manualSaved,
    sessionMissing,
    markNotToday,
    markDayOff,
    markNoShift,
    markOutsideWindow,
    markDeviceRecorded,
    marked,
};
