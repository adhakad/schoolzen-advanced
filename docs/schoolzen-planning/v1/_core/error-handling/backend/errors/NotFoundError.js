const AppError = require('./AppError');

/**
 * NotFoundError — 404. Fetching/updating/deleting something by an ID
 * that doesn't exist (or doesn't belong to the caller's school —
 * always treat "exists but wrong tenant" as NotFound, never leak that
 * distinction, per the multi-tenancy isolation rule).
 *
 * Usage:
 *   throw new NotFoundError('Student not found', {
 *     module: 'student', code: 'STUDENT_NOT_FOUND', context: { studentId }
 *   });
 */
class NotFoundError extends AppError {
  constructor(message, { module, code, context } = {}) {
    super(message, {
      category: 'NotFoundError',
      code,
      statusCode: 404,
      module,
      context,
      isOperational: true
    });
  }
}

module.exports = NotFoundError;
