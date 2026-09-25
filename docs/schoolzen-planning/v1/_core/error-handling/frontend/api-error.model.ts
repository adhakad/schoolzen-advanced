/**
 * The ONE shape every API error response takes, matching the
 * backend's AppError.toResponse(). Every component/service that
 * handles an HTTP error casts to this - no guessing per endpoint.
 */
export type ErrorCategory =
  | 'ValidationError'
  | 'AuthenticationError'
  | 'PermissionError'
  | 'NotFoundError'
  | 'ConflictError'
  | 'RateLimitError'
  | 'ExternalServiceError'
  | 'InternalError';

export interface ApiFieldError {
  field: string;
  code?: string;    // stable i18n key, e.g. "AADHAR_INVALID_FORMAT" - see `code` below
  message: string;
}

export interface ApiError {
  category: ErrorCategory;
  /**
   * A stable, fine-grained machine code, e.g. "AUTH_INVALID_CREDENTIALS",
   * "CLASS_HAS_STUDENTS". This is the actual i18n lookup key - the
   * backend NEVER translates `message` itself (API responses stay
   * language-agnostic on purpose, see ../backend/errors/AppError.js's
   * doc comment); the frontend's i18n service looks up `errors.<code>`
   * and only falls back to rendering `message` directly (English) if
   * that code has no translation yet. Can be null for a handful of
   * truly one-off InternalError cases.
   */
  code: string | null;
  message: string;
  requestId: string;
  fields?: ApiFieldError[];   // only present for ValidationError
  retryAfter?: number;        // only present for RateLimitError, in seconds
}

export interface ApiErrorResponse {
  error: ApiError;
}
