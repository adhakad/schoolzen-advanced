'use strict';

// Settings' messages — every string from settings/errors.md's four tables, defined once.
// The code is the stable contract (the frontend keys on it); the message is the English
// source text. Builders take the dynamic parts (counts, labels) as arguments.

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

// --- Page 1 — Academic Sessions ---------------------------------------------------------
const sessionDateRangeInvalid = () => 'Choose a valid session date range.';
const sessionLabelFormatInvalid = () => 'Session label must be in the format 2026-2027.';
const sessionLabelDuplicate = () => 'A session with this label already exists.';
const sessionConfirmMismatch = () => 'Type the session label exactly to confirm.';
const sessionAlreadyActive = () => 'This session is already active.';
// The race loser (errors.md shape 9): a DIFFERENT session won — say which, so the admin
// re-confirms rather than silently overriding it.
const sessionOtherNowActive = (label) =>
    `${label} was just made active by someone else — review it before switching again.`;
const sessionReactivationBlocked = () =>
    "A closed session can't be reactivated — create a new session instead.";
const sessionInUse = () => "This session has existing records and can't be deleted.";
const sessionDeleteNotUpcoming = () => 'Only an upcoming session can be deleted.';
const sessionCopyForwardPartial = (failed) =>
    `${failed} of the selected item types couldn't be copied — the rest were created normally.`;
const sessionNotFound = () => 'This record no longer exists.';

// --- Page 2 — Admission Form Fields -----------------------------------------------------
const fieldDefinitionInvalid = () => 'Enter a name and type for this field.';
const fieldKeyDuplicate = () => 'A field with this key already exists.';
const fieldLocked = () => "This field is required by law/board rules and can't be hidden or made optional.";
const fieldStateInvalid = () => 'Select a valid state for this field.';
const fieldHasData = (count) =>
    `${plural(count, 'student record', 'student records')} have data in this field — hiding it is reversible, deleting it is not.`;
const fieldTypeChangeUnsafe = () =>
    "Changing this field's type may make existing student data invalid — review affected records first.";
const fieldOptionRemovalUnsafe = (count) =>
    `${plural(count, 'student record', 'student records')} use an option you're removing — they'll show an unrecognized value.`;
const fieldConfigChanged = () =>
    "This field's rules were just changed by someone else — refresh before continuing.";
const fieldNotCustom = () => "Built-in fields can't be deleted — hide them instead.";

// --- Page 3 — Roles & Permissions -------------------------------------------------------
const roleNameRequired = () => 'Role name is required.';
const roleNameDuplicate = () => 'A role with this name already exists.';
const superAdminRoleProtected = () => "The Super Admin role can't be edited or removed.";
const roleScopeAlreadyAssigned = () => 'This class/section is already assigned this role to someone else.';
const roleAlreadyHeld = () => 'This person already holds this role.';
const ownerRoleProtected = () => "The account owner's Super Admin access can't be removed.";
const roleScopeNotAllowed = () => "This role isn't class-scoped — leave the class/section blank.";
const roleScopeRequired = () => 'Choose a class for this class-scoped role.';
const roleInUse = (count) => `${plural(count, 'staff member', 'staff members')} hold this role — reassign them first.`;

// --- Page 4 — Marksheet Templates -------------------------------------------------------
const templateNotFound = () => "This template doesn't exist.";
const templateReassignWarning = (count) =>
    `This template is used by ${plural(count, 'other class', 'other classes')} — they'll be affected too.`;
const classTemplateAlreadyAssigned = () =>
    'This class already has a template assigned — replacing it will regenerate its marksheet structure.';
const subjectGroupMissing = () => "Set up this class's subject group before assigning a marksheet template.";
const templateRegenerateNote = () =>
    "This will regenerate the marksheet structure for this class — already-generated marksheets aren't retroactively changed.";

// --- Shared -----------------------------------------------------------------------------
const notFound = () => 'This record no longer exists.';
const deleteConfirmRequired = () => 'Type DELETE to confirm.';

module.exports = {
    sessionDateRangeInvalid, sessionLabelFormatInvalid, sessionLabelDuplicate, sessionConfirmMismatch,
    sessionAlreadyActive, sessionOtherNowActive, sessionReactivationBlocked, sessionInUse,
    sessionDeleteNotUpcoming, sessionCopyForwardPartial, sessionNotFound,
    fieldDefinitionInvalid, fieldKeyDuplicate, fieldLocked, fieldStateInvalid, fieldHasData,
    fieldTypeChangeUnsafe, fieldOptionRemovalUnsafe, fieldConfigChanged, fieldNotCustom,
    roleNameRequired, roleNameDuplicate, superAdminRoleProtected, roleScopeAlreadyAssigned, roleAlreadyHeld,
    ownerRoleProtected, roleScopeNotAllowed, roleScopeRequired, roleInUse,
    templateNotFound, templateReassignWarning, classTemplateAlreadyAssigned, subjectGroupMissing,
    templateRegenerateNote,
    notFound, deleteConfirmRequired,
};
