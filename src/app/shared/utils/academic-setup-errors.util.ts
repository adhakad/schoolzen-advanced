/**
 * Inline form errors for the three Academic Setup modals.
 *
 * The backend sends a stable `code` plus an English `message`; the page shows the message,
 * falling back to its own wording for the code when a field arrives without one. Two error
 * categories land inline beside the inputs: every ValidationError, and a ConflictError that
 * names its field (CLASS_DUPLICATE / SUBJECT_DUPLICATE / SUBJECT_GROUP_DUPLICATE) — the
 * ErrorInterceptor skips its toast for exactly that case, so a page that ignored it would
 * leave a rejected save looking like nothing happened.
 *
 * NOTE: @ngx-translate is not installed in this app yet (no i18n JSON exists), so these are
 * English strings keyed by code — the table a translation file would replace.
 */
import { toApiError } from 'src/app/shared/utils/api-error.util';

export const ACADEMIC_SETUP_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  CLASS_NAME_REQUIRED: 'Class name is required.',
  CLASS_DUPLICATE: 'This class already exists.',
  CLASS_SECTIONS_IN_USE: 'Students are placed in a section outside any stream — reassign them first.',
  CLASS_SECTIONS_UNCONFIRMED: 'Sections outside any stream will be removed — confirm to continue.',
  SUBJECT_NAME_REQUIRED: 'Subject name is required.',
  SUBJECT_DUPLICATE: 'A subject with this name already exists.',
  SUBJECT_GROUP_NAME_REQUIRED: 'Group name is required.',
  SUBJECT_GROUP_EMPTY: 'Select at least one subject for this group.',
  SUBJECT_GROUP_DUPLICATE: 'A group with this name already exists for this class/stream.',
  SUBJECT_NOT_FOUND: 'One of the selected subjects no longer exists — refresh and try again.',
  STREAM_REQUIRED: 'Select a stream for this class.',
  STREAM_NOT_ALLOWED: "This class doesn't have streams — leave this blank.",
  SYSTEM_GROUP_LOCKED: "This automatic group's name and class can't change.",
  DUPLICATE_SUBMIT: 'This request is already being processed.',
  NOT_FOUND: 'This record no longer exists.'
};

export interface InlineFormErrors {
  fields: Record<string, string>;
  formError: string;
}

/**
 * Field → message for the inputs the modal renders (`knownFields`); anything else becomes
 * the form-level message, so a rejection is always said somewhere. Null when the error is
 * not one a form shows inline (the interceptor has already surfaced it).
 */
export const inlineFormErrors = (error: unknown, knownFields: readonly string[]): InlineFormErrors | null => {
  const apiError = toApiError(error);
  if (!apiError) return null;
  const inline = apiError.category === 'ValidationError'
    || (apiError.category === 'ConflictError' && !!apiError.fields?.length);
  if (!inline) return null;

  const fallback = (code?: string): string =>
    (code && ACADEMIC_SETUP_ERROR_MESSAGES[code]) || apiError.message;

  const fields: Record<string, string> = {};
  let formError = '';
  (apiError.fields || []).forEach((field) => {
    const message = field.message || fallback(field.code || apiError.code);
    if (knownFields.indexOf(field.field) === -1) formError = formError || message;
    else fields[field.field] = message;
  });

  if (!formError && !Object.keys(fields).length) formError = fallback(apiError.code);
  return { fields, formError };
};
