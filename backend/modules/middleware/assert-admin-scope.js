'use strict';
const { ValidationError, PermissionError } = require('../errors');

// Every v2 module route is scoped to one school. The client sends `adminId` the way every
// route in this codebase does (query string on reads, body on writes) — that part is
// unchanged — but here it is checked against the caller's own token instead of being
// trusted, so one school can never read or write another's configuration by editing the
// parameter.
//
// Runs after isAdminAuth, which puts the verified token payload on req.user. An admin's
// payload is { id, mobile } (minted in controllers/users/admin-user.js), so the admin's own
// id IS the adminId; a teacher token carries an explicit adminId claim instead.
const assertAdminScope = (module) => {
    return (req, res, next) => {
        const adminId = req.query.adminId || req.body.adminId;
        if (!adminId) {
            return next(new ValidationError('adminId is required', {
                module,
                fields: [{ field: 'adminId', message: 'adminId is required' }],
            }));
        }

        const caller = req.user || {};
        const callerAdminId = caller.adminId || caller.id;
        if (String(callerAdminId) !== String(adminId)) {
            return next(new PermissionError("You don't have access to this school's data.", {
                module,
                context: { adminId },
            }));
        }

        return next();
    };
};

module.exports = assertAdminScope;
