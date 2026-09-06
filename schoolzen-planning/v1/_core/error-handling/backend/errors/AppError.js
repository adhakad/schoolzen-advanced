/**
 * AppError — base class every category error extends.
 * See ../README.md for the full category table and reasoning.
 */
class AppError extends Error {
  /**
   * @param {string} message - SAFE, user-presentable text. Never a raw
   *   DB error, stack trace, or internal detail — this string may be
   *   shown directly in a toast.
   * @param {object} opts
   * @param {string} opts.category - matches the class name, e.g. "ValidationError"
   * @param {number} opts.statusCode - HTTP status to send
   * @param {string} opts.module - which module raised this, e.g. "fees", "student"
   * @param {object} [opts.context] - extra structured data for LOGS ONLY, never sent to the client
   * @param {Array<{field:string,message:string}>} [opts.fields] - only for ValidationError
   * @param {boolean} [opts.isOperational=true] - false marks this as an unexpected bug, not an expected failure
   */
  constructor(message, opts) {
    super(message);
    this.name = this.constructor.name;
    this.category = opts.category;
    this.statusCode = opts.statusCode;
    this.module = opts.module || 'unknown';
    this.context = opts.context || {};
    this.fields = opts.fields;
    this.isOperational = opts.isOperational !== false;
    Error.captureStackTrace(this, this.constructor);
  }

  /** Shape sent to the client — never includes `context` or the stack. */
  toResponse(requestId) {
    const body = {
      category: this.category,
      message: this.message,
      requestId
    };
    if (this.fields) body.fields = this.fields;
    return { error: body };
  }
}

module.exports = AppError;
