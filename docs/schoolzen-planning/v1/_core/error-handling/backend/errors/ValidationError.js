const AppError = require('./AppError');

/**
 * ValidationError — 400. A required field missing, a value failing a
 * FieldConfig rule, a malformed request body.
 *
 * `fields` feeds the UI's inline field-error convention directly (see
 * ../../settings/admission-form-fields.md) — always pass it when the
 * error traces to specific field(s); omit it for a request-level
 * validation failure with no single field to blame. Each field entry
 * SHOULD carry its own `code` too (e.g. "AADHAR_INVALID_FORMAT") for
 * the same reason the top-level error does — inline field errors get
 * translated client-side the same way toast errors do.
 *
 * Usage:
 *   throw new ValidationError('Please fix the highlighted fields', {
 *     module: 'student',
 *     code: 'VALIDATION_FAILED',
 *     fields: [{ field: 'aadharNumber', code: 'AADHAR_INVALID_FORMAT', message: 'Must be a 12-digit number' }]
 *   });
 */
class ValidationError extends AppError {
  constructor(message, { module, code, fields, context } = {}) {
    super(message, {
      category: 'ValidationError',
      code,
      statusCode: 400,
      module,
      fields,
      context,
      isOperational: true
    });
  }
}

module.exports = ValidationError;
