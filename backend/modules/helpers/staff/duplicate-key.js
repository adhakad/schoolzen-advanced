'use strict';
const { ConflictError } = require('../../errors');
const messages = require('../messages/staff.messages');

// Staff's uniqueness errors (errors.md shapes 2 + 9). Each model's unique index is the real
// guard; controller pre-checks are only a fast path. An E11000 from a concurrent write is
// translated here into the same stable code the pre-check throws.
const MODULE = 'staff';

const conflict = (code, field, message) => new ConflictError(message, {
    module: MODULE,
    code,
    fields: [{ field, message, code }],
});

const empCodeDuplicate = () => conflict('EMP_CODE_DUPLICATE', 'empCode', messages.empCodeDuplicate());
const departmentDuplicate = () => conflict('DEPARTMENT_DUPLICATE', 'name', messages.departmentDuplicate());
const designationDuplicate = () => conflict('DESIGNATION_DUPLICATE', 'title', messages.designationDuplicate());
const cardDuplicate = () => conflict('CARD_ALREADY_ASSIGNED', 'cardNumber', messages.cardAlreadyAssigned());

const isDuplicateKey = (error) => Boolean(error)
    && (error.code === 11000 || /E11000/.test(String(error.message || '')));

/** Re-throws `error`, translated when it is an E11000 from one of this module's indexes. */
const rethrowDuplicate = (error, fallback) => {
    if (!isDuplicateKey(error)) throw error;
    const keys = Object.keys(error.keyPattern || {});
    if (keys.includes('empCode')) throw empCodeDuplicate();
    if (keys.includes('cardNumber')) throw cardDuplicate();
    if (keys.includes('title')) throw designationDuplicate();
    if (keys.includes('name')) throw departmentDuplicate();
    if (fallback) throw fallback();
    throw error;
};

module.exports = { empCodeDuplicate, departmentDuplicate, designationDuplicate, cardDuplicate, isDuplicateKey, rethrowDuplicate };
