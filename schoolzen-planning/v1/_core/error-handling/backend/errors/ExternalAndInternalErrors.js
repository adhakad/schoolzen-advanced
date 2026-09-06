const AppError = require('./AppError');

/**
 * ExternalServiceError — 502. A third-party dependency failed or
 * timed out (WhatsApp reminder provider, payment gateway, SMS
 * gateway). Always operational (it's not OUR bug) but sampled at
 * 100% in Sentry since these need visibility every time (see
 * ../README.md's scalability notes).
 */
class ExternalServiceError extends AppError {
  constructor(message = 'A required external service is unavailable right now. Please try again shortly.', { module, context } = {}) {
    super(message, {
      category: 'ExternalServiceError',
      statusCode: 502,
      module,
      context,
      isOperational: true
    });
  }
}

/**
 * InternalError — 500. The catch-all for anything unexpected — a
 * genuine bug, not a foreseen failure mode. `isOperational: false`
 * marks this so the process-level handler can distinguish "expected
 * failure, keep serving requests" from "something is actually wrong."
 * The real `message` is logged/sent to Sentry but NEVER shown to the
 * user — the frontend always displays a generic fallback for this
 * category (see ../frontend/error.interceptor.ts).
 */
class InternalError extends AppError {
  constructor(message, { module, context } = {}) {
    super(message || 'Something went wrong.', {
      category: 'InternalError',
      statusCode: 500,
      module,
      context,
      isOperational: false
    });
  }
}

module.exports = { ExternalServiceError, InternalError };
