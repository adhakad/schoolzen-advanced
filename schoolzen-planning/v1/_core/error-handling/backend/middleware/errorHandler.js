/**
 * THE single Express error-handling middleware. Mounted LAST, after
 * every route and every other middleware (Express convention: an
 * error middleware is identified by its 4-argument signature).
 *
 * With `express-async-errors` required once at app startup (see
 * app.js snippet below), any thrown error - including a rejected
 * promise inside an `async` route handler - lands here automatically.
 * No route handler needs its own try/catch for the common case.
 *
 * npm install express-async-errors @sentry/node
 */
require('express-async-errors');
const Sentry = require('@sentry/node');
const { AppError, InternalError, ConflictError } = require('../errors');
const { logError } = require('../utils/logger');

/**
 * Normalizes ANY thrown value into an AppError instance. Route
 * handlers and services should throw the specific category classes
 * directly (ValidationError, NotFoundError, etc.) - this function is
 * the safety net for things that weren't already one of ours: a raw
 * Mongo error, a bug that threw a plain string, a library's own
 * error type.
 */
function normalizeError(err, module) {
  if (err instanceof AppError) return err;

  // Raw Mongo duplicate-key error - map to the friendly ConflictError,
  // never let the raw Mongo message reach the client (database-
  // architecture.md §8's rule).
  if (err.code === 11000) {
    return ConflictError.fromMongoDuplicateKey(err, module);
  }

  // Anything else is an unexpected bug - wrap it, keep the original
  // message only in context for logging, never send it to the client.
  return new InternalError('Something went wrong.', {
    module,
    context: { originalMessage: err.message, name: err.name }
  });
}

function errorHandler(err, req, res, next) {
  const module = req.moduleName || (req.baseUrl || '').split('/').filter(Boolean)[1] || 'unknown';
  const appError = normalizeError(err, module);

  logError(appError, req.requestId);

  // Only unexpected bugs (isOperational: false) go to Sentry as
  // exceptions - operational errors are business-as-usual and would
  // just create alert noise; they're still fully logged via Winston above.
  if (!appError.isOperational) {
    Sentry.withScope((scope) => {
      scope.setTag('category', appError.category);
      scope.setTag('module', appError.module);
      scope.setContext('requestId', { id: req.requestId });
      Sentry.captureException(appError);
    });
  }

  res.status(appError.statusCode).json(appError.toResponse(req.requestId));
}

module.exports = errorHandler;

/*
=== app.js wiring (for reference, not part of this file's export) ===

require('express-async-errors');           // MUST be required before routes are defined
const Sentry = require('@sentry/node');
Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.2 });

const requestId = require('./middleware/requestId');
const errorHandler = require('./middleware/errorHandler');

app.use(requestId);
// ... all your routes ...
app.use(errorHandler);   // LAST - after every route
*/
