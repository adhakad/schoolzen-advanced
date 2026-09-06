/**
 * Centralized Winston logger — every log line in the app goes through
 * this, in structured JSON (never console.log/console.error directly
 * in route handlers or services). See ../../README.md's scalability
 * notes for why structured logs matter at scale.
 *
 * npm install winston
 */
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
    // In production, add a transport shipping to your log aggregator
    // (CloudWatch, Datadog, ELK, etc.) - console output alone doesn't
    // scale past local development.
  ]
});

/**
 * Logs an AppError with full context (never shown to the client - see
 * AppError.toResponse for what IS shown). Call this from the error
 * middleware, not scattered across route handlers.
 */
function logError(err, requestId) {
  const meta = {
    requestId,
    category: err.category || 'InternalError',
    module: err.module || 'unknown',
    statusCode: err.statusCode || 500,
    isOperational: err.isOperational !== false,
    context: err.context || {}
  };

  if (meta.isOperational) {
    // Expected failure (validation, not-found, conflict, etc.) - info/warn level,
    // not an alert-worthy event, but still fully logged for debugging/analytics.
    logger.warn(err.message, meta);
  } else {
    // Unexpected bug - error level, includes the stack, this is what should
    // page an on-call engineer via the log aggregator's alerting rules.
    logger.error(err.message, { ...meta, stack: err.stack });
  }
}

module.exports = { logger, logError };
