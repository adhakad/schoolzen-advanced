'use strict';

/**
 * THE single Express error-handling middleware. Mounted LAST in app.js, after every route
 * and every other middleware (Express identifies an error middleware by its 4-argument
 * signature).
 *
 * With `express-async-errors` required once at app startup, any thrown error — including a
 * rejected promise inside an `async` route handler — lands here automatically. No route
 * handler needs its own try/catch for the common case.
 *
 * Existing legacy controllers still catch their own errors and respond exactly as they
 * always did; this middleware only sees what nothing else caught.
 */
const { AppError, InternalError, ConflictError } = require('../errors');
const { logError } = require('../helpers/logger');
const errorReporter = require('../helpers/error-reporter');

/**
 * Normalizes ANY thrown value into an AppError. Route handlers and services should throw
 * the specific category classes directly (ValidationError, NotFoundError, ...) — this is
 * the safety net for things that weren't already one of ours: a raw Mongo error, a bug that
 * threw a plain string, a library's own error type.
 */
function normalizeError(err, module) {
    if (err instanceof AppError) return err;

    // Raw Mongo duplicate-key error — mapped to the friendly ConflictError, never letting
    // the raw Mongo message reach the client.
    if (err && err.code === 11000) {
        return ConflictError.fromMongoDuplicateKey(err, module);
    }

    // Anything else is an unexpected bug — wrap it, keep the original message in context
    // for logging only, never send it to the client.
    return new InternalError('Something went wrong.', {
        module,
        context: { originalMessage: err && err.message, name: err && err.name }
    });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    // `/v1/student/...` -> 'student'. req.moduleName lets a route override that explicitly.
    const module = req.moduleName || (req.baseUrl || '').split('/').filter(Boolean)[1] || 'unknown';
    const appError = normalizeError(err, module);

    logError(appError, req.requestId);

    // Only unexpected bugs (isOperational: false) are reported as exceptions — operational
    // errors are business-as-usual and would just create alert noise. They are still fully
    // logged above.
    if (!appError.isOperational) {
        errorReporter.captureException(appError, {
            category: appError.category,
            module: appError.module,
            requestId: req.requestId
        });
    }

    if (res.headersSent) return next(err);

    return res.status(appError.statusCode).json(appError.toResponse(req.requestId));
}

module.exports = errorHandler;
