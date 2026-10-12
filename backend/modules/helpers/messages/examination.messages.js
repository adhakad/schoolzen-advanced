'use strict';

// The Examination module's own messages (examination/errors.md) — wording defined once.

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

module.exports = {
    // Shape 1
    marksMaxInvalid: () => 'Enter a valid maximum for this subject.',
    subjectsRequired: () => 'Select at least one subject.',
    examNameRequired: () => 'Exam name is required.',
    examNameTooLong: () => "Exam name can't be more than 60 characters.",
    scheduleIncomplete: () => 'Set a date and time for every subject in this exam.',
    timeOrderInvalid: () => 'Start time must be before end time.',
    marksSubjectMismatch: () => "This subject isn't part of this class's marksheet structure.",
    // Shape 2
    structureDuplicate: () => 'An admit card structure already exists for this class.',
    // Shape 3
    marksExceedMax: (max) => `Score can't exceed the maximum (${max}) for this subject.`,
    marksNegative: () => "Score can't be negative.",
    structureNotConfigured: () => 'Set up the marksheet/admit card structure for this class first.',
    subjectScheduledTwice: () => 'This subject is scheduled twice — remove the duplicate row.',
    subjectTimeClash: () => "Two subjects can't be scheduled at the same time within one exam.",
    dateOutsideSession: () => 'This date falls outside the current academic session.',
    examOnHoliday: (dates) => `This date is marked as a holiday — students may not be able to attend (${dates.join(', ')}).`,
    scopeEmpty: () => 'No students currently match this scope — check your selection.',
    crossStructureClash: (n, examName) => `${plural(n, 'student')} already have another exam scheduled at this time (see '${examName}').`,
    // Shape 4
    subjectNotFound: () => "One of this structure's subjects no longer exists.",
    recordNotGenerated: () => "This hasn't been generated yet for this student.",
    templateNotFound: () => 'The selected template no longer exists.',
    notFound: () => 'This record no longer exists.',
    sessionNotFound: () => 'This academic session does not exist yet.',
    notEnrolled: () => 'This student has no class placement in the selected session.',
    jobNotFound: () => 'This job no longer exists.',
    subjectsNoLongerInGroup: (n) => `${plural(n, 'subject')} in this schedule are no longer part of this class's subject group.`,
    // Shape 5/6
    marksAlreadyEntered: () => "This term's result already exists — save anyway to overwrite it?",
    generationInProgress: (action) => `This exam's admit cards are still being generated — please wait before ${action}.`,
    // Shape 7
    marksRowInvalid: (n) => `${plural(n, 'student row')} have invalid marks — see highlighted cells.`,
    generationPartial: (done, total, failed) => `Admit cards generated for ${done} of ${total} students — ${failed} failed, see details.`,
    printSelectionIncomplete: (n) => `${n} of the selected students don't have a generated document yet — they were skipped.`,
    bulkOneClass: () => 'Select students from one class only.',
    // Shape 8
    queueUnavailable: () => "Couldn't start generation right now — please try saving again in a moment.",
    // Shape 9
    structureChanged: () => 'This structure was changed by someone else — please review before saving.',
    // Success
    structureSaved: (label) => `Marksheet structure saved for ${label}.`,
    structureRemoved: (label) => `Marksheet setup removed for ${label}.`,
    marksSaved: (name) => `Marks saved for ${name}.`,
    bulkMarksSaved: (n) => `Marks saved for ${plural(n, 'student')}.`,
    admitStructureCreated: (n) => `Structure saved — generating admit cards for ${plural(n, 'student')}.`,
    admitStructureUpdated: (n) => `Structure updated — regenerating admit cards for ${plural(n, 'student')}.`,
    admitStructureDeleted: (exam) => `${exam} deleted.`,
};
