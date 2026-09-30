'use strict';

// Academic Setup's own messages — the ones that carry module meaning and so do not fit the
// generic CRUD builders in common.messages.js.
//
// Each takes the dynamic parts as arguments rather than being assembled at the call site,
// so the exact wording (including the singular/plural switch) is defined once and can be
// reused anywhere else it is needed — the delete confirmation dialog shows the same
// sentence the API answers with.
const classAlreadySetUp = (className) => `${className} is already set up.`;

const classHasStudents = (count, className) =>
    `${count} ${count === 1 ? 'student is' : 'students are'} in ${className} and will need reassigning.`;

const classNotFound = () => 'Class not found';

// The automatic "General" group of a non-streamed class (classes-sections.md).
const systemGroupLocked = () =>
    'This is the automatic "General" group of a class without streams — it can only be removed by deleting the class.';
const groupsOnlyForStreams = (className) =>
    `${className} has no streams — its students all use the automatic "General" group, so there's nothing to add here.`;

// Hard block (classes-sections.md): enrollments and First Enrolled Class are real class-id
// references, and nothing in the app can show "a class that no longer exists".
const classBlockedByStudents = (count, className) =>
    `${className} can't be deleted: ${count} ${count === 1 ? 'student is' : 'students are'} placed in it or first enrolled in it. ` +
    'Move or promote them to another class first.';
const classesBlockedByStudents = (count) =>
    `The selected classes can't be deleted: ${count} ${count === 1 ? 'student is' : 'students are'} placed in or first enrolled in them. ` +
    'Move or promote them to another class first.';

const classesHaveStudents = (count) =>
    `${count} ${count === 1 ? 'student is' : 'students are'} enrolled in the selected ` +
    `${count === 1 ? 'class' : 'classes'} and will need reassigning.`;

const subjectAlreadyExists = (name) => `${name} is already in this school's subject list.`;

const subjectNotFound = () => 'Subject not found';

// Named after what the admin has to DO about it, not after the constraint — the same
// sentence is shown in the delete confirmation and returned by the API.
const subjectsInGroups = (groupCount, subjectCount) =>
    `${subjectCount === 1 ? 'This subject is' : 'These subjects are'} used by ${groupCount} ` +
    `subject ${groupCount === 1 ? 'group' : 'groups'}, which will need updating.`;

const groupAlreadyExists = (name) => `A group called ${name} already exists for this class.`;

const groupNotFound = () => 'Subject group not found';

const streamRequired = (className) =>
    `${className} has streams, so this group must belong to one of them.`;

const streamNotAllowed = (className) => `${className} has no streams, so leave Stream unset.`;

const streamNotInClass = () => 'That stream does not belong to the chosen class.';

const subjectsNotFound = (count) =>
    `${count} selected ${count === 1 ? 'subject was' : 'subjects were'} not found — refresh and try again.`;

module.exports = {
    classAlreadySetUp,
    classHasStudents,
    classesHaveStudents,
    classBlockedByStudents,
    systemGroupLocked,
    groupsOnlyForStreams,
    classesBlockedByStudents,
    classNotFound,
    subjectAlreadyExists,
    subjectNotFound,
    subjectsInGroups,
    subjectsNotFound,
    groupAlreadyExists,
    groupNotFound,
    streamRequired,
    streamNotAllowed,
    streamNotInClass,
};
