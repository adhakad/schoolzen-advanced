/**
 * AppError — base class every category error extends.
 * See ../README.md for the full category table and reasoning.
 */
class AppError extends Error {
  /**
   * @param {string} message - SAFE, user-presentable text. Never a raw
   *   DB error, stack trace, or internal detail — this string may be
   *   shown directly in a toast. Also what gets logged (English,
   *   stable) — the CLIENT decides whether to show this or translate
   *   `code` instead; the backend never translates this string itself
   *   (see i18n note below).
   * @param {object} opts
   * @param {string} opts.category - matches the class name, e.g. "ValidationError".
   *   Drives HTTP status + generic frontend UI treatment (toast vs.
   *   inline vs. redirect) — coarse-grained, shared by every module.
   * @param {string} [opts.code] - a STABLE, fine-grained machine code,
   *   e.g. "AUTH_INVALID_CREDENTIALS", "CLASS_HAS_STUDENTS". This is
   *   the wire contract's actual identity — the frontend's i18n layer
   *   maps `code` to a localized string; `message` is only the
   *   English fallback/log text. Never invent a new code per call site
   *   ad hoc — reuse an existing one if the failure is the same kind
   *   as one that already exists, the same way `category` is reused.
   *   Omit only for truly one-off InternalError cases with no stable
   *   identity worth giving a code.
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
    this.code = opts.code || null;
    this.statusCode = opts.statusCode;
    this.module = opts.module || 'unknown';
    this.context = opts.context || {};
    this.fields = opts.fields;
    this.isOperational = opts.isOperational !== false;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Shape sent to the client — never includes `context` or the stack.
   * `message` is English and only a fallback: the frontend's i18n
   * layer looks up `code` first (see ../README.md's "Error codes vs.
   * categories" section) and only falls back to rendering `message`
   * directly if that module hasn't added a translation for `code` yet.
   * The backend NEVER localizes this response itself — that's a
   * client-side concern (API responses stay language-agnostic so one
   * backend serves every locale without change). The one place the
   * backend DOES translate is outbound notifications (WhatsApp/Email/
   * SMS), which have no frontend render step — see
   * additional-technical-considerations.md's Notifications section.
   */
  toResponse(requestId) {
    const body = {
      category: this.category,
      code: this.code,
      message: this.message,
      requestId
    };
    if (this.fields) body.fields = this.fields;
    return { error: body };
  }
}

module.exports = AppError;
