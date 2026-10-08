'use strict';
const { ConflictError } = require('../../errors');
const messages = require('../messages/settings.messages');

// Settings' uniqueness errors (errors.md, shapes 2 + 9). Each model's unique index is the
// REAL guard; a concurrent write that slips past any pre-check comes back as E11000 and is
// translated here into the same stable code — never the global handler's generic
// "This admin id (...) is already in use."

const MODULE = 'settings';

const conflict = (code, message, field) => new ConflictError(message, {
    module: MODULE,
    code,
    ...(field ? { fields: [{ field, message, code }] } : {}),
});

const sessionLabelDuplicate = () => conflict('SESSION_LABEL_DUPLICATE', messages.sessionLabelDuplicate(), 'startDate');
const fieldKeyDuplicate = () => conflict('FIELD_KEY_DUPLICATE', messages.fieldKeyDuplicate(), 'label');
const roleNameDuplicate = () => conflict('ROLE_NAME_DUPLICATE', messages.roleNameDuplicate(), 'name');
// Scope conflicts are toasts — the matrix cell has no form field to pin them to.
const roleScopeAlreadyAssigned = () => conflict('ROLE_SCOPE_ALREADY_ASSIGNED', messages.roleScopeAlreadyAssigned());
const roleAlreadyHeld = () => conflict('ROLE_SCOPE_ALREADY_ASSIGNED', messages.roleAlreadyHeld());
const classTemplateAlreadyAssigned = () =>
    conflict('CLASS_TEMPLATE_ALREADY_ASSIGNED', messages.classTemplateAlreadyAssigned());

const isDuplicateKey = (error) => Boolean(error)
    && (error.code === 11000 || /E11000/.test(String(error.message || '')));

/**
 * Re-throw `error`, translated when it is an E11000 from one of this module's indexes. The
 * caller passes the translation because it knows which collection it wrote; `byKeys` lets a
 * write that can trip two indexes (RoleAssignment) pick by the index's key pattern.
 */
const rethrowDuplicate = (error, translate) => {
    if (!isDuplicateKey(error)) throw error;
    const keys = Object.keys(error.keyPattern || {});
    const translated = typeof translate === 'function' ? translate(keys) : null;
    throw translated || error;
};

module.exports = {
    isDuplicateKey,
    rethrowDuplicate,
    sessionLabelDuplicate,
    fieldKeyDuplicate,
    roleNameDuplicate,
    roleScopeAlreadyAssigned,
    roleAlreadyHeld,
    classTemplateAlreadyAssigned,
};
