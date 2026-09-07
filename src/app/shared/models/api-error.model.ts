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
}

export interface ApiError {
  category: ErrorCategory;
  message: string;
  requestId: string;
  fields?: ApiFieldError[];   // only present for ValidationError
  retryAfter?: number;        // only present for RateLimitError, in seconds
}

export interface ApiErrorResponse {
  error: ApiError;
}
