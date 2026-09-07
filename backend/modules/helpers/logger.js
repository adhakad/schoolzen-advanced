'use strict';

// The single logger for the whole app — structured JSON through Winston, never a bare
// console.log in a controller or service. The attendance pipeline runs in a worker process
// with nobody watching a UI, so a swallowed error is an invisible error; every catch logs
// through here even when the HTTP response still follows the repo's `catch -> 500`
// convention.
//
// The `(event, data)` helpers below are the API the existing controllers/queues/services
// already call — their signature is unchanged, only the transport underneath is. `logError`
// is the error-handling architecture's entry point (see modules/middleware/errorHandler.js
// and docs/schoolzen-planning/v1/_core/error-handling/README.md): it logs an AppError with
// its full context, which is never sent to the client.

const winston = require('winston');

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'schoolzen-api' },
    transports: [
        new winston.transports.Console()
        // In production, add a transport shipping to your log aggregator (CloudWatch,
        // Datadog, ELK, etc.) — console output alone doesn't scale past local development.
    ]
});

// Keeps the pre-Winston call shape: logger.info('punch-batch-inserted', { count })
// and logger.error('sync-failed', errorObject) both still work.
const meta = (data) => {
    if (data instanceof Error) return { error: data.message, stack: data.stack };
    if (data === undefined) return {};
    return { data };
};

const info = (event, data) => logger.info(event, meta(data));
const warn = (event, data) => logger.warn(event, meta(data));
const error = (event, data) => logger.error(event, meta(data));

/**
 * Logs an AppError with full context (never shown to the client — see
 * AppError.toResponse for what IS shown). Called from the error middleware, not
 * scattered across route handlers.
 */
function logError(err, requestId) {
    const payload = {
        requestId,
        category: err.category || 'InternalError',
        module: err.module || 'unknown',
        statusCode: err.statusCode || 500,
        isOperational: err.isOperational !== false,
        context: err.context || {}
    };

    if (payload.isOperational) {
        // Expected failure (validation, not-found, conflict, ...) — logged for debugging
        // and analytics, but not an alert-worthy event.
        logger.warn(err.message, payload);
    } else {
        // Unexpected bug — includes the stack; this is what a log aggregator's alerting
        // rules should page an on-call engineer for.
        logger.error(err.message, Object.assign({}, payload, { stack: err.stack }));
    }
}

module.exports = { logger, logError, info, warn, error };
