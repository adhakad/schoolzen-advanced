/**
 * Settings' error codes → English text (settings/errors.md, all four pages).
 *
 * The backend always sends `code` + `message`; pages SHOW `message` (errorMessageOf /
 * inlineFormErrors) and fall back to this table only when a field error arrives without one.
 * @ngx-translate is not installed in this app yet, so this is the table a locale file would
 * replace — same arrangement as academic-setup-errors.util.ts.
 */
import { toApiError } from 'src/app/shared/utils/api-error.util';

export const SETTINGS_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  // Academic Sessions
  SESSION_DATE_RANGE_INVALID: 'Choose a valid session date range.',
  SESSION_LABEL_FORMAT_INVALID: 'Session label must be in the format 2026-2027.',
  SESSION_LABEL_DUPLICATE: 'A session with this label already exists.',
  SESSION_CONFIRM_MISMATCH: 'Type the session label exactly to confirm.',
  SESSION_ALREADY_ACTIVE: 'This session is already active.',
  SESSION_REACTIVATION_BLOCKED: "A closed session can't be reactivated — create a new session instead.",
  SESSION_IN_USE: "This session has existing records and can't be deleted.",
  SESSION_COPY_FORWARD_PARTIAL: "Some of the selected item types couldn't be copied — the rest were created normally.",
  // Admission Form Fields
  FIELD_DEFINITION_INVALID: 'Enter a name and type for this field.',
  FIELD_KEY_DUPLICATE: 'A field with this key already exists.',
  FIELD_LOCKED: "This field is required by law/board rules and can't be hidden or made optional.",
  FIELD_HAS_DATA: 'Student records have data in this field — hiding it is reversible, deleting it is not.',
  FIELD_TYPE_CHANGE_UNSAFE: "Changing this field's type may make existing student data invalid — review affected records first.",
  FIELD_OPTION_REMOVAL_UNSAFE: "Student records use an option you're removing — they'll show an unrecognized value.",
  FIELD_CONFIG_CHANGED: "This field's rules were just changed by someone else — refresh before continuing.",
  VALIDATION_FAILED: 'Select a valid state for this field.',
  // Roles & Permissions
  ROLE_NAME_REQUIRED: 'Role name is required.',
  ROLE_NAME_DUPLICATE: 'A role with this name already exists.',
  SUPER_ADMIN_ROLE_PROTECTED: "The Super Admin role can't be edited or removed.",
  ROLE_SCOPE_ALREADY_ASSIGNED: 'This class/section is already assigned this role to someone else.',
  OWNER_ROLE_PROTECTED: "The account owner's Super Admin access can't be removed.",
  ROLE_SCOPE_NOT_ALLOWED: "This role isn't class-scoped — leave the class/section blank.",
  ROLE_IN_USE: 'Staff members hold this role — reassign them first.',
  // Marksheet Templates
  TEMPLATE_NOT_FOUND: "This template doesn't exist.",
  TEMPLATE_REASSIGN_WARNING: "This template is used by other classes — they'll be affected too.",
  CLASS_TEMPLATE_ALREADY_ASSIGNED: 'This class already has a template assigned — replacing it will regenerate its marksheet structure.',
  SUBJECT_GROUP_MISSING: "Set up this class's subject group before assigning a marksheet template.",
  // Shared
  NOT_FOUND: 'This record no longer exists.'
};

export interface SettingsFormErrors {
  fields: Record<string, string>;
  formError: string;
}

/**
 * Field → message for the inputs a Settings modal renders (`knownFields`); anything else
 * becomes the form-level message, so a rejection is always said somewhere. Null when the
 * error isn't one a form shows inline (the interceptor has already toasted it).
 */
export const settingsFormErrors = (error: unknown, knownFields: readonly string[]): SettingsFormErrors | null => {
  const apiError = toApiError(error);
  if (!apiError) return null;
  const inline = apiError.category === 'ValidationError'
    || (apiError.category === 'ConflictError' && !!apiError.fields?.length);
  if (!inline) return null;

  const fallback = (code?: string): string => (code && SETTINGS_ERROR_MESSAGES[code]) || apiError.message;
  const fields: Record<string, string> = {};
  let formError = '';
  (apiError.fields || []).forEach((field) => {
    const message = field.message || fallback(field.code || apiError.code);
    if (knownFields.indexOf(field.field) === -1) formError = formError || message;
    else fields[field.field] = message;
  });
  if (!apiError.fields?.length) formError = apiError.message || fallback(apiError.code);
  return { fields, formError };
};
