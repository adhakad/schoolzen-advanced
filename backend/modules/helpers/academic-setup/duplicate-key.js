'use strict';
const { ConflictError } = require('../../errors');
const { getClassDisplayName } = require('../format-class-name');
const messages = require('../messages/academic-setup.messages');

// Academic Setup's uniqueness errors (errors.md, shapes 2 + 9). The REAL guard is each model's
// unique index; the controllers' findOne pre-checks are only a fast path for a friendlier
// message. A concurrent duplicate that slips past the pre-check reaches the database and
// comes back as E11000 — this turns that into the same stable code the pre-check throws,
// never the generic "This admin id (...) is already in use." the global handler would build.

const MODULE = 'academic-setup';

const classDuplicate = (classValue) => {
    const message = messages.classAlreadySetUp(getClassDisplayName(classValue) || 'This class');
    return new ConflictError(message, {
        module: MODULE,
        code: 'CLASS_DUPLICATE',
        fields: [{ field: 'class', message, code: 'CLASS_DUPLICATE' }],
        context: { class: classValue },
    });
};

const subjectDuplicate = (name) => {
    const message = messages.subjectAlreadyExists(name);
    return new ConflictError(message, {
        module: MODULE,
        code: 'SUBJECT_DUPLICATE',
        fields: [{ field: 'name', message, code: 'SUBJECT_DUPLICATE' }],
        context: { name },
    });
};

const groupDuplicate = (name) => {
    const message = messages.groupAlreadyExists(name);
    return new ConflictError(message, {
        module: MODULE,
        code: 'SUBJECT_GROUP_DUPLICATE',
        fields: [{ field: 'name', message, code: 'SUBJECT_GROUP_DUPLICATE' }],
        context: { name },
    });
};

const isDuplicateKey = (error) => Boolean(error)
    && (error.code === 11000 || /E11000/.test(String(error.message || '')));

/**
 * Re-throws `error`, translated when it is an E11000 from one of this module's unique
 * indexes. The index is recognised by its key pattern — (adminId, class) is Class,
 * (adminId, classId, streamId, name) is Subject Group, (adminId, name) is Subject — so a
 * Class save that also writes groups reports whichever index actually fired. `fallback`
 * builds the error when the driver gave no key pattern.
 */
const rethrowDuplicate = (error, fallback) => {
    if (!isDuplicateKey(error)) throw error;
    const keys = Object.keys(error.keyPattern || {});
    const value = error.keyValue || {};
    if (keys.includes('class')) throw classDuplicate(value.class);
    if (keys.includes('classId') && keys.includes('name')) throw groupDuplicate(value.name);
    if (keys.includes('name')) throw subjectDuplicate(value.name);
    if (fallback) throw fallback();
    throw error;
};

module.exports = { classDuplicate, subjectDuplicate, groupDuplicate, isDuplicateKey, rethrowDuplicate };
