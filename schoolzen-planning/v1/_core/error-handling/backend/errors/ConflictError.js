const AppError = require('./AppError');

/**
 * ConflictError — 409. A duplicate-key violation or any other "this
 * conflicts with something that already exists" failure — duplicate
 * Admission No., double-booked Roll No., a Receipt No. collision.
 *
 * `ConflictError.fromMongoDuplicateKey` maps a raw Mongo error code
 * 11000 into a friendly message naming which field collided, per
 * database-architecture.md §8's "never surface a raw Mongo error"
 * rule — use this instead of hand-writing the message every time.
 *
 * Usage:
 *   throw new ConflictError('Admission No. 2024142 is already in use', { module: 'student' });
 *   // or, catching a raw Mongo error:
 *   catch (err) { throw ConflictError.fromMongoDuplicateKey(err, 'student'); }
 */
class ConflictError extends AppError {
  constructor(message, { module, context } = {}) {
    super(message, {
      category: 'ConflictError',
      statusCode: 409,
      module,
      context,
      isOperational: true
    });
  }

  static fromMongoDuplicateKey(mongoErr, module) {
    const field = Object.keys(mongoErr.keyPattern || {})[0] || 'value';
    const value = mongoErr.keyValue ? mongoErr.keyValue[field] : undefined;
    const friendlyField = field.replace(/([A-Z])/g, ' $1').toLowerCase(); // admissionNo -> admission no
    const message = value
      ? `This ${friendlyField} (${value}) is already in use.`
      : `This ${friendlyField} is already in use.`;
    return new ConflictError(message, { module, context: { mongoKeyPattern: mongoErr.keyPattern } });
  }
}

module.exports = ConflictError;
