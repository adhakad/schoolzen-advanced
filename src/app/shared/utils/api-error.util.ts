/**
 * Reading a rejected request's ApiError — shared by every v2 page that binds server field
 * errors to its own inputs.
 *
 * ErrorInterceptor rethrows the SHAPED ApiError (every other category has already been
 * surfaced by then); a call that bypasses it delivers the raw HttpErrorResponse. Both
 * shapes are accepted.
 */
import { HttpErrorResponse } from '@angular/common/http';
import { ApiError, ApiErrorResponse, ApiRowError } from 'src/app/shared/models/api-error.model';

export const toApiError = (error: unknown): ApiError | undefined => {
  const candidate = error as (ApiError & Partial<HttpErrorResponse>) | undefined;
  if (candidate && candidate.category) return candidate as ApiError;
  return (candidate?.error as ApiErrorResponse | undefined)?.error;
};

/**
 * Field → message map for an error a form should show inline: every ValidationError, and a
 * ConflictError that names its field (a duplicate Admission No./Aadhar/roll number — the
 * interceptor skips its toast for exactly this case). Null for anything else.
 */
export const validationErrorsOf = (error: unknown): { fields: Record<string, string>; message: string } | null => {
  const apiError = toApiError(error);
  if (!apiError) return null;
  const inline = apiError.category === 'ValidationError'
    || (apiError.category === 'ConflictError' && !!apiError.fields?.length);
  if (!inline) return null;
  const fields: Record<string, string> = {};
  (apiError.fields || []).forEach((field) => { fields[field.field] = field.message; });
  return { fields, message: apiError.message };
};

/** The per-record failures of a bulk request, when the response carried them. */
export const rowErrorsOf = (error: unknown): ApiRowError[] => toApiError(error)?.rows || [];

/** Any category's user-facing message (ConflictError's, for instance), or a fallback. */
export const errorMessageOf = (error: unknown, fallback = 'Something went wrong.'): string =>
  toApiError(error)?.message || fallback;
