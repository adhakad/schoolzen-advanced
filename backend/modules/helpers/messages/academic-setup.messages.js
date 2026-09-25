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
