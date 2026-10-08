'use strict';
const { ConflictError } = require('../../errors');
const messages = require('../messages/attendance.messages');

// SHIFT_DUPLICATE (errors.md shapes 2 + 9). The unique index is the real guard; an E11000
// from a concurrent create is translated into the same code the pre-check throws.
const shiftDuplicate = () => new ConflictError(messages.shiftDuplicate(), {
    module: 'attendance',
    code: 'SHIFT_DUPLICATE',
    fields: [{ field: 'name', message: messages.shiftDuplicate(), code: 'SHIFT_DUPLICATE' }],
});

const isDuplicateKey = (error) => Boolean(error)
    && (error.code === 11000 || /E11000/.test(String(error.message || '')));

const rethrowShiftDuplicate = (error) => {
    if (isDuplicateKey(error)) throw shiftDuplicate();
    throw error;
};

module.exports = { shiftDuplicate, isDuplicateKey, rethrowShiftDuplicate };
