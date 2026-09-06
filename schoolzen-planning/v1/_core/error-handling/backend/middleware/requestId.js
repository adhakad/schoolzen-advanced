/**
 * Attaches a correlation ID to every request - reuses one the
 * frontend already sent (see ../../frontend/error.interceptor.ts,
 * which sends X-Request-Id on every call) or generates a fresh one.
 * This ID threads through logs, Sentry, and the error response body
 * so a user's error toast can be traced to an exact log line.
 *
 * npm install uuid
 */
const { v4: uuidv4 } = require('uuid');

function requestId(req, res, next) {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

module.exports = requestId;
