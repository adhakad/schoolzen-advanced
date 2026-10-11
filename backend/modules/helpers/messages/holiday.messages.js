'use strict';

// The Holiday module's own messages (holiday/errors.md) — wording defined once.
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

const notFound = () => 'This record no longer exists.';
const sessionMissing = () => 'No academic session is active — set one in Settings first.';

// Holidays
const nameRequired = () => 'Name is required.';
const dateRangeInvalid = () => 'The last day cannot be before the first day.';
const rangeTooLong = (max) => `A holiday can span at most ${max} days.`;
const holidayDuplicate = () => 'This holiday is already declared for that date.';
const holidayDeleted = (templates) => (templates
    ? `Holiday deleted and removed from ${plural(templates, 'template', 'templates')}.`
    : 'Holiday deleted successfully.');
const generateInvalid = () => 'Choose a state and year.';
const systemDataMissing = () => 'No official holiday data is available yet for this state — add holidays manually for now.';
const generated = (inserted, skipped) => (skipped
    ? `${plural(inserted, 'holiday', 'holidays')} added, ${skipped} already existed and were skipped.`
    : `${plural(inserted, 'holiday', 'holidays')} added.`);

// Templates
const templateNameRequired = () => 'Template name is required.';
const templateDuplicate = () => 'A template with this name already exists.';
const templateInUse = (count) => `${plural(count, 'person is', 'people are')} still using this template. Change their template first!`;
const defaultProtected = () => 'The Default template cannot be deleted — it applies to everyone without a template.';
const holidayNotFound = () => 'That holiday was not found.';
const weeklyOffInvalid = () => 'Pick valid weekly off days.';

// Assign
const templateNotFound = () => 'The selected template no longer exists — refresh and try again.';
const selectionEmpty = () => 'Select at least one person.';
const mixedSelection = () => 'Your selection mixes people who already have a template with people who do not. Use Assign for new people and Edit for assigned ones.';
const useEdit = () => 'These people already have a template — use Edit instead.';
const useAssign = () => 'These people have no template yet — use Assign instead.';
const personNotFound = () => 'One or more selected people could not be found.';
const assigned = (count) => `Template assigned to ${plural(count, 'person', 'people')}.`;
const reassigned = (count) => `Template changed for ${plural(count, 'person', 'people')}.`;
const unassigned = (count) => `Template removed for ${plural(count, 'person', 'people')} — the Default template now applies.`;

module.exports = {
    notFound,
    sessionMissing,
    nameRequired,
    dateRangeInvalid,
    rangeTooLong,
    holidayDuplicate,
    holidayDeleted,
    generateInvalid,
    systemDataMissing,
    generated,
    templateNameRequired,
    templateDuplicate,
    templateInUse,
    defaultProtected,
    holidayNotFound,
    weeklyOffInvalid,
    templateNotFound,
    selectionEmpty,
    mixedSelection,
    useEdit,
    useAssign,
    personNotFound,
    assigned,
    reassigned,
    unassigned,
};
