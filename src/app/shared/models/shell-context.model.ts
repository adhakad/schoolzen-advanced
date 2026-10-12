/**
 * The one shape the app shell reads. Produced by ShellContextService, which adapts
 * whichever legacy session is active (admin or teacher) into this single view.
 *
 * When R3 (unified roles & permissions) lands, only ShellContextService changes —
 * the shell components consume this interface and never touch an auth service.
 */

/**
 * Permission keys the sidebar gates on. These mirror the eight booleans the legacy
 * teacher record carries (`<key>Permission.status`), which is what the shell reads
 * today; R3 will replace the source, not these keys.
 */
export type ShellPermissionKey =
  | 'student'
  | 'admission'
  | 'promoteFail'
  | 'attendance'
  | 'salary'
  | 'fee'
  | 'marksheet'
  | 'admitCard'
  | 'transferCertificate';

export const SHELL_PERMISSION_KEYS: readonly ShellPermissionKey[] = [
  'student', 'admission', 'promoteFail', 'attendance',
  'salary', 'fee', 'marksheet', 'admitCard', 'transferCertificate'
];

export type ShellRole = 'admin' | 'teacher';

/**
 * The caller's v2 Roles & Permissions grants (GET /api/v2/settings/my-permissions) — the
 * same union the backend's requirePermission() checks. Module keys are the backend's
 * PERMISSION_MODULES ('marksheet-structure', 'admit-card', ...).
 */
export interface V2Permissions {
  isSuperAdmin: boolean;
  modules: Readonly<Record<string, { canView: boolean; canEdit: boolean }>>;
}

/** View access to a v2 permission module (edit implies view). */
export const v2CanView = (permissions: V2Permissions | null | undefined, module: string): boolean => {
  if (!permissions) return true;
  if (permissions.isSuperAdmin) return true;
  const grant = permissions.modules[module];
  return Boolean(grant && (grant.canView || grant.canEdit));
};

export interface ShellSchool {
  name: string;
  /** e.g. "CBSE · Indore, Madhya Pradesh" */
  meta: string;
  initials: string;
  logoUrl: string | null;
}

export interface ShellNotification {
  id: string;
  text: string;
  time: string;
  unread: boolean;
}

export interface ShellContext {
  role: ShellRole;
  displayName: string;
  initials: string;
  school: ShellSchool | null;
  sessions: readonly string[];
  activeSession: string;
  permissions: Readonly<Record<ShellPermissionKey, boolean>>;
  /**
   * The admin session's v2 grants. Absent/null until loaded (or if the load fails) — the
   * sidebar then locks nothing and the API, which enforces every grant anyway, answers.
   */
  v2Permissions?: V2Permissions | null;
}
