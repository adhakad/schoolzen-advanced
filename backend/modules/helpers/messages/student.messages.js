'use strict';

// Student module messages — the ones that carry module meaning and so do not fit the
// generic CRUD builders in common.messages.js. Same rule as academic-setup.messages.js:
// the wording lives here once, never inline at a res.json()/throw site.

const plural = (count, one, many) => (count === 1 ? one : many);

const studentNotFound = () => 'Student not found';
const studentsNotFound = (count) =>
    `${count} selected ${plural(count, 'student was', 'students were')} not found — refresh and try again.`;

const deleteNeedsConfirmation = (count) =>
    `Deleting ${count} ${plural(count, 'student', 'students')} also removes their login access, ` +
    'fee records, admit cards, and results. Type DELETE to confirm.';

const classNotConfigured = () => 'That class is not set up in Academic Setup.';
const streamRequired = (className) => `${className} has streams — pick a stream.`;
const streamNotAllowed = (className) => `${className} has no streams, so leave Stream unset.`;
const streamNotInClass = () => 'That stream does not belong to the chosen class.';
const sectionNotInPlacement = () => 'That section does not belong to the chosen class/stream.';
const groupNotInPlacement = () => 'That subject group does not belong to the chosen class/stream.';

const excelNeedsStream = (className) =>
    `${className} has streams — pick a stream too, since Excel import/export applies to one class(+stream).`;
const excelFileRequired = () => 'Choose an Excel (.xlsx) file to import.';
const excelEmpty = () => 'That sheet has no student rows under the header row.';
const importQueued = () => 'Import started — you can keep working while it runs.';

const admissionNoLocked = () => 'Admission No. has already been issued and cannot be changed.';
const placementLocked = () => 'Stream and Subject Group can only be changed while a promotion into a streamed class is incomplete.';

const cardsQueued = (count) =>
    `${count} ${plural(count, 'card', 'cards')} saved — syncing to biometric devices now.`;
const cardInUse = (cardNumber) => `Card ${cardNumber} is already assigned to another student.`;
const noCardToResync = () => 'This student has no card assigned yet — use Assign Card first.';
const resyncQueued = () => 'Resync started — every device will get this card again shortly.';

const letterNotReady = () => 'This admission is still Pending — issue an Admission No. before printing its letter.';

const promotionTargetInvalid = () => 'A Promote To class/section is not set up in Academic Setup — refresh and try again.';
const promotionNothingDecided = () => 'Mark at least one student as Promote or Detain first.';
const promotionAlreadyPlaced = (count, session) =>
    `${count} ${plural(count, 'student already has', 'students already have')} a ${session} placement and will be skipped.`;
const promotionQueued = (count, session) =>
    `Promotion started for ${count} ${plural(count, 'student', 'students')} — ${session} placements are being created.`;
const warnStreamMissing = (count, className) =>
    `${count} ${plural(count, 'student is', 'students are')} moving into ${className} and still ` +
    `${plural(count, 'needs', 'need')} a Stream + Subject Group selected before their promotion completes.`;
const warnFeeStructureMissing = (className, session) =>
    `No Fee Structure exists yet for ${className} in session ${session} — set one in Fee Structure first, ` +
    'or promoted students will show no fee record until it\'s added.';

const jobNotFound = () => 'That background job was not found — it may have expired.';

// Uniqueness (student/errors.md, shape #2) — one message per catalog code.
const duplicate = {
    ADMISSION_NO_DUPLICATE: () => 'This admission number is already in use.',
    ROLL_NUMBER_DUPLICATE: () => 'This roll number is already taken in this class.',
    AADHAR_DUPLICATE: () => 'This Aadhar number is already registered.',
    SAMAGRA_ID_DUPLICATE: () => 'This Samagra ID is already registered.',
    UDISE_DUPLICATE: () => 'This UDISE number is already registered.',
    CARD_ALREADY_ASSIGNED: () => 'This card is already assigned to someone else.',
};

// External-service failure (shape #8) — safe wording, never the provider's own error.
const imageUploadFailed = () =>
    "Couldn't upload the photo — the record was saved without it, try adding it again.";

const doaBeforeDob = () => "Admission date can't be before date of birth.";
const promotionLimit = () => "Students can't be promoted past the 12th class.";
const promotionTargetNotHigher = () => 'Promote To must be a higher class than the current one.';
const classNameUnrecognized = (text) => `'${text}' doesn't match any class.`;
const classOutOfScope = (text, scope) =>
    `'${text}' is a different class — this import is for ${scope}; import it with that class selected.`;
const duplicateInFile = (label, otherRow) => `${label} is repeated in row ${otherRow} of this file.`;
const bulkRowsFailed = (failed, total) => `${failed} of ${total} rows could not be imported`;
const duplicateSubmit = () => 'This request is already being processed.';

module.exports = {
    duplicate,
    imageUploadFailed,
    doaBeforeDob,
    promotionLimit,
    promotionTargetNotHigher,
    classNameUnrecognized,
    classOutOfScope,
    duplicateInFile,
    bulkRowsFailed,
    duplicateSubmit,
    studentNotFound,
    studentsNotFound,
    deleteNeedsConfirmation,
    classNotConfigured,
    streamRequired,
    streamNotAllowed,
    streamNotInClass,
    sectionNotInPlacement,
    groupNotInPlacement,
    excelNeedsStream,
    excelFileRequired,
    excelEmpty,
    importQueued,
    admissionNoLocked,
    placementLocked,
    cardsQueued,
    cardInUse,
    noCardToResync,
    resyncQueued,
    letterNotReady,
    promotionTargetInvalid,
    promotionNothingDecided,
    promotionAlreadyPlaced,
    promotionQueued,
    warnStreamMissing,
    warnFeeStructureMissing,
    jobNotFound,
};
