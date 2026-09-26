/**
 * Reading a rejected request's ApiError — shared by every v2 page that binds server field
 * errors to its own inputs.
 *
 * ErrorInterceptor rethrows the SHAPED ApiError (every other category has already been
 * surfaced by then); a call that bypasses it delivers the raw HttpErrorResponse. Both
 * shapes are accepted.
 */
import { HttpErrorResponse } from '@angular/common/http';
import { ApiError, ApiErrorResponse } from 'src/app/shared/models/api-error.model';

export const toApiError = (error: unknown): ApiError | undefined => {
  const candidate = error as (ApiError & Partial<HttpErrorResponse>) | undefined;
  if (candidate && candidate.category) return candidate as ApiError;
  return (candidate?.error as ApiErrorResponse | undefined)?.error;
};

/** Field → message map from a ValidationError, plus the message to show when no field fits. */
export const validationErrorsOf = (error: unknown): { fields: Record<string, string>; message: string } | null => {
  const apiError = toApiError(error);
  if (!apiError || apiError.category !== 'ValidationError') return null;
  const fields: Record<string, string> = {};
  (apiError.fields || []).forEach((field) => { fields[field.field] = field.message; });
  return { fields, message: apiError.message };
};

/** Any category's user-facing message (ConflictError's, for instance), or a fallback. */
export const errorMessageOf = (error: unknown, fallback = 'Something went wrong.'): string =>
  toApiError(error)?.message || fallback;
