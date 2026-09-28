'use strict';
const { ValidationError, PermissionError } = require('../errors');

// Every v2 module route is scoped to one school. The client sends `adminId` the way every
// route in this codebase does (query string on reads, body on writes) — that part is
// unchanged — but here it is checked against the caller's own token instead of being
// trusted, so one school can never read or write another's data by editing the parameter.
//
// Runs after isAdminAuth, which puts the verified token payload on req.user. An admin's
// payload is { id, mobile } (minted in controllers/users/admin-user.js), so the admin's own
// id IS the adminId; a teacher token carries an explicit adminId claim instead.
//
// EVERY adminId the request carries is checked — query AND body — never just the first one
// found. Checking only `query.adminId || body.adminId` let a request pass with its own id in
// the query while a controller that reads `req.body.adminId` wrote into another school. And
// once verified, the token's id is written back over both, so no controller can ever see a
// value other than the one the session proved (student/errors.md, tenant isolation).
const assertAdminScope = (module) => {
    return (req, res, next) => {
        const body = req.body || {};
        const sent = [req.query.adminId, body.adminId].filter((value) => value !== undefined && value !== '');
        if (sent.length === 0) {
            return next(new ValidationError('adminId is required', {
                module,
                fields: [{ field: 'adminId', message: 'adminId is required' }],
            }));
        }

        const caller = req.user || {};
        const callerAdminId = String(caller.adminId || caller.id || '');
        if (!callerAdminId || sent.some((value) => String(value) !== callerAdminId)) {
            return next(new PermissionError("You don't have access to this school's data.", {
                module,
                context: { sent },
            }));
        }

        req.adminId = callerAdminId;
        if (req.query.adminId !== undefined) req.query.adminId = callerAdminId;
        if (req.body && typeof req.body === 'object') req.body.adminId = callerAdminId;
        return next();
    };
};

module.exports = assertAdminScope;
