const AppError = require('./AppError');

/**
 * ValidationError — 400. A required field missing, a value failing a
 * FieldConfig rule, a malformed request body.
 *
 * `fields` feeds the UI's inline field-error convention directly (see
 * ../../settings/admission-form-fields.md) — always pass it when the
 * error traces to specific field(s); omit it for a request-level
 * validation failure with no single field to blame.
 *
 * Usage:
 *   throw new ValidationError('Please fix the highlighted fields', {
 *     module: 'student',
 *     fields: [{ field: 'aadharNumber', message: 'Must be a 12-digit number' }]
 *   });
 */
class ValidationError extends AppError {
  constructor(message, { module, fields, context } = {}) {
    super(message, {
      category: 'ValidationError',
      statusCode: 400,
      module,
      fields,
      context,
      isOperational: true
    });
  }
}

module.exports = ValidationError;
