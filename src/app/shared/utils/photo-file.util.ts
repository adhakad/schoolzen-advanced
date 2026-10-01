/**
 * The student photo's client-side check — one rule for every place a photo is picked (the
 * Create/Edit/Admission form's circle + button, and Manage Students' row avatar), so the
 * two paths can never disagree about what the same endpoint accepts.
 */

/** Largest photo the server accepts (middleware/single-upload.js imageFile). */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** The picker's `accept` — JPG/PNG only. */
export const PHOTO_ACCEPT = 'image/png,image/jpeg';

/** The message for a file the server would refuse, or '' when it's fine to send. */
export const photoFileError = (file: File): string => {
  if (!/^image\/(png|jpe?g)$/.test(file.type)) return 'Only JPG/PNG images are allowed.';
  if (file.size > MAX_PHOTO_BYTES) return 'Image must be under 2MB.';
  return '';
};
