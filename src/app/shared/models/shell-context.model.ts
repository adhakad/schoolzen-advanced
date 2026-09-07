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
}
