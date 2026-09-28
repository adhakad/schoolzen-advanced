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
  message: string;
  /** Stable catalog code, e.g. "AADHAR_DUPLICATE" (module errors.md). */
  code?: string;
}

/** One failed record of a bulk operation (error-catalog-conventions.md, shape #7). */
export interface ApiRowError {
  row?: number;
  id?: string;
  studentId?: string;
  code?: string;
  message?: string;
  fields?: ApiFieldError[];
}

export interface ApiError {
  category: ErrorCategory;
  message: string;
  requestId: string;
  /** Stable catalog code from the module's errors.md, when the case has one. */
  code?: string;
  /**
   * The field(s) the failure traces to — always for ValidationError, and for a
   * ConflictError that traces to one form field (e.g. a duplicate Admission No.), which the
   * form then shows inline instead of a toast.
   */
  fields?: ApiFieldError[];
  /** Bulk sibling of `fields` — one entry per failed record. */
  rows?: ApiRowError[];
  retryAfter?: number;        // only present for RateLimitError, in seconds
}

export interface ApiErrorResponse {
  error: ApiError;
}
