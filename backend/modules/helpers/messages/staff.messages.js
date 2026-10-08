'use strict';

// The Staff module's own messages (staff/errors.md) — wording defined once, shared by the API
// response and anything else that needs the same sentence.
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

const staffNotFound = () => 'This record no longer exists.';
const departmentNotFound = () => 'This record no longer exists.';
const designationNotFound = () => 'This record no longer exists.';

const empCodeDuplicate = () => 'This employee code is already in use.';
const departmentDuplicate = () => 'This department already exists.';
const designationDuplicate = () => 'This designation already exists in that department.';
const cardAlreadyAssigned = () => 'This card is already assigned to another staff member.';

const designationRequiresDepartment = () => 'Pick a department before choosing a designation.';
const staffDepartmentInvalid = () => 'Selected department does not exist.';
const staffDesignationInvalid = () => 'Selected designation does not exist.';
const designationNotInDepartment = () => 'That designation belongs to a different department.';
const designationDepartmentInvalid = () => 'Selected department does not exist.';

const departmentDeactivateWarning = (count) =>
    `${plural(count, 'active staff member still belongs', 'active staff still belong')} to this department.`;

const departmentInUse = (staff, designations) => {
    const parts = [];
    if (staff) parts.push(plural(staff, 'staff member', 'staff'));
    if (designations) parts.push(plural(designations, 'designation', 'designations'));
    return `${parts.join(' and ')} use this department — reassign them first, or type DELETE to remove it anyway.`;
};
const designationInUse = (staff) => `${plural(staff, 'staff member holds', 'staff members hold')} this designation.`;

const staffInUse = (counts) => {
    if (counts.biometric) return 'This staff member has an active biometric device mapping and cannot be deleted. Remove their card first.';
    const what = [];
    if (counts.payroll) what.push('payroll records');
    if (counts.salaryStructure) what.push('a salary structure');
    if (counts.leave) what.push('leave records');
    return `This staff member has ${what.join(', ')} and cannot be deleted. Deactivate instead.`;
};

const ownerProtected = () => "The school owner can't be deactivated or deleted.";
const staffTerminated = () => 'Staff member removed. Their login and role access have been revoked.';
const statusChanged = (status) => `Staff member marked ${status === 'active' ? 'Active' : 'Inactive'}.`;

const cardsQueued = (count) => `${plural(count, 'card', 'cards')} saved — pushing to devices.`;
const cardRemoved = () => 'Card removed — removing it from devices.';
const resyncQueued = () => 'Re-sync queued — pushing the card to devices.';
const noCardToResync = () => 'This staff member has no card to re-sync.';
const jobNotFound = () => 'That job no longer exists.';

module.exports = {
    staffNotFound,
    departmentNotFound,
    designationNotFound,
    empCodeDuplicate,
    departmentDuplicate,
    designationDuplicate,
    cardAlreadyAssigned,
    designationRequiresDepartment,
    staffDepartmentInvalid,
    staffDesignationInvalid,
    designationNotInDepartment,
    designationDepartmentInvalid,
    departmentDeactivateWarning,
    departmentInUse,
    designationInUse,
    staffInUse,
    ownerProtected,
    staffTerminated,
    statusChanged,
    cardsQueued,
    cardRemoved,
    resyncQueued,
    noCardToResync,
    jobNotFound,
};
