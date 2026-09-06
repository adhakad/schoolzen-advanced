const AppError = require('./AppError');

/**
 * RateLimitError — 429. Too many requests from one client in a
 * window (login attempts, bulk-action spamming, etc). `retryAfter`
 * (seconds) is included so the frontend can show a countdown instead
 * of a bare "try again" toast.
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please wait a moment and try again.', { module, retryAfter, context } = {}) {
    super(message, {
      category: 'RateLimitError',
      statusCode: 429,
      module,
      context,
      isOperational: true
    });
    this.retryAfter = retryAfter; // seconds
  }

  toResponse(requestId) {
    const base = super.toResponse(requestId);
    if (this.retryAfter) base.error.retryAfter = this.retryAfter;
    return base;
  }
}

module.exports = RateLimitError;
