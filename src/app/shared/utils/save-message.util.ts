import { MessageResponse } from 'src/app/shared/models/student/student.model';

/**
 * A save's toast: the confirmation, or — when it saved with caveats (IMAGE_UPLOAD_FAILED:
 * saved, photo not; FEE_STRUCTURE_MISSING: saved, no fee record yet) — every caveat, so
 * none is hidden behind another.
 */
export const saveMessage = (res: MessageResponse): string => {
  const warnings = res.warnings?.length ? res.warnings : res.warning ? [res.warning] : [];
  return warnings.length ? [res.message + '.', ...warnings.map((warning) => warning.message)].join(' ') : res.message;
};
