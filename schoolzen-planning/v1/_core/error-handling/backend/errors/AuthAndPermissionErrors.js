const AppError = require('./AppError');

/**
 * AuthenticationError — 401. Missing, invalid, or expired session.
 * The frontend interceptor redirects to login on this category; the
 * message is rarely shown since the redirect itself is the feedback.
 */
class AuthenticationError extends AppError {
  constructor(message = 'Your session has expired. Please log in again.', { module, context } = {}) {
    super(message, {
      category: 'AuthenticationError',
      statusCode: 401,
      module,
      context,
      isOperational: true
    });
  }
}

/**
 * PermissionError — 403. Authenticated, but not allowed to do this
 * specific thing (e.g. a teacher without Fees access hits a Fees
 * route) — this is R3's permission system's error, distinct from
 * AuthenticationError (who are you) vs. this (you, but not allowed).
 */
class PermissionError extends AppError {
  constructor(message = "You don't have permission to do this.", { module, context } = {}) {
    super(message, {
      category: 'PermissionError',
      statusCode: 403,
      module,
      context,
      isOperational: true
    });
  }
}

module.exports = { AuthenticationError, PermissionError };
