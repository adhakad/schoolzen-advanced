/**
 * The single adapter the app shell reads for "who is logged in, at which school, in
 * which session, with which permissions".
 *
 * It composes what already exists — AdminAuthService / TeacherAuthService (the eight
 * legacy `<key>Permission.status` booleans), SchoolService, the v2 AcademicSessionsService —
 * into one ShellContext. No legacy service is modified.
 *
 * When R3 (unified roles & permissions) lands, this file is the only thing that
 * changes: the shell components consume ShellContext and never touch an auth service.
 */
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { TeacherAuthService } from 'src/app/services/auth/teacher-auth.service';
import { SchoolService } from 'src/app/services/school.service';
import { TeacherService } from 'src/app/services/teacher.service';
import { AcademicSessionsService } from 'src/app/shared/services/settings/academic-sessions.service';
import { RolesPermissionsService } from 'src/app/shared/services/settings/roles-permissions.service';
// "2026-2027" — the fallback when the server has no academic-session document at all.
import { currentSessionLabel, pickHeaderSession } from 'src/app/shared/utils/academic-session.util';
import {
  ShellContext,
  ShellPermissionKey,
  ShellRole,
  ShellSchool,
  SHELL_PERMISSION_KEYS
} from 'src/app/shared/models/shell-context.model';

/** Legacy teacher records key their permissions differently from the shell's keys. */
const TEACHER_PERMISSION_FIELD: Readonly<Record<ShellPermissionKey, string>> = {
  student: 'studentPermission',
  admission: 'admissionPermission',
  promoteFail: 'promoteFailPermission',
  attendance: 'attendancePermission',
  // Payroll/salary has no legacy teacher permission of its own; it follows attendance
  // access until R3 introduces a real one.
  salary: 'attendancePermission',
  fee: 'feeCollectionPermission',
  marksheet: 'marksheetPermission',
  admitCard: 'admitCardPermission',
  transferCertificate: 'transferCertificatePermission'
};

const allPermissions = (value: boolean): Record<ShellPermissionKey, boolean> => {
  const result = {} as Record<ShellPermissionKey, boolean>;
  SHELL_PERMISSION_KEYS.forEach((key) => { result[key] = value; });
  return result;
};

const initialsOf = (text: string): string =>
  (text || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('') || '?';


const EMPTY_CONTEXT: ShellContext = {
  role: 'admin',
  displayName: '',
  initials: '?',
  school: null,
  sessions: [],
  activeSession: '',
  permissions: allPermissions(false)
};

@Injectable({ providedIn: 'root' })
export class ShellContextService {
  private readonly context$ = new BehaviorSubject<ShellContext>(EMPTY_CONTEXT);
  private loaded = false;
  private sessionStoreKey = '';

  constructor(
    private adminAuthService: AdminAuthService,
    private teacherAuthService: TeacherAuthService,
    private schoolService: SchoolService,
    private teacherService: TeacherService,
    private academicSessionsService: AcademicSessionsService,
    private rolesPermissionsService: RolesPermissionsService
  ) {}

  /** The shell subscribes to this; it emits again as school/session/permissions land. */
  get context(): Observable<ShellContext> {
    return this.context$.asObservable();
  }

  get snapshot(): ShellContext {
    return this.context$.value;
  }

  /**
   * Which session is active right now, read straight from the auth cookies — safe to
   * call before load(), which is why the error interceptor uses it to pick a login route.
   */
  activeRole(): ShellRole {
    return this.teacherAuthService.getAccessToken()?.accessToken ? 'teacher' : 'admin';
  }

  hasAnySession(): boolean {
    return Boolean(
      this.adminAuthService.getAccessToken()?.accessToken ||
      this.teacherAuthService.getAccessToken()?.accessToken
    );
  }

  /** Idempotent — the shell calls it on init; repeat calls after the first are no-ops. */
  load(force = false): void {
    if (this.loaded && !force) return;
    this.loaded = true;

    const role = this.activeRole();
    const user = role === 'teacher'
      ? this.teacherAuthService.getLoggedInTeacherInfo()
      : this.adminAuthService.getLoggedInAdminInfo();

    const displayName: string = user?.name || user?.firstName || (role === 'teacher' ? 'Teacher' : 'Admin');

    this.patch({
      role,
      displayName,
      initials: initialsOf(displayName),
      // An admin sees everything; only a teacher is permission-gated today.
      permissions: allPermissions(role === 'admin')
    });

    this.loadSchool(user?.adminId || user?.id);
    this.loadSessions(user?.adminId || user?.id, user?.id);
    if (role === 'teacher') this.loadTeacherPermissions(user);
    else this.loadV2Permissions(user?.id);
  }

  /** Re-read the v2 grants (e.g. after Roles & Permissions changed the caller's own role). */
  refreshV2Permissions(): void {
    if (this.snapshot.role !== 'teacher') this.loadV2Permissions(this.adminAuthService.getLoggedInAdminInfo()?.id);
  }

  /** The header switch: every page re-reads for it, and the choice is remembered per user. */
  setActiveSession(session: string): void {
    this.patch({ activeSession: session });
    try { if (this.sessionStoreKey) localStorage.setItem(this.sessionStoreKey, session); } catch { /* not remembered */ }
  }

  logout(): void {
    if (this.snapshot.role === 'teacher') this.teacherAuthService.logout();
    else this.adminAuthService.logout();
  }

  private loadSchool(adminId: string | undefined): void {
    const cached = this.schoolService.getSchoolData();
    if (cached) {
      this.patch({ school: this.toShellSchool(cached) });
      return;
    }
    if (!adminId) return;
    this.schoolService.getSchool(adminId).subscribe((res: any) => {
      if (!res) return;
      this.schoolService.setSchoolData(res);
      this.patch({ school: this.toShellSchool(res) });
    }, () => { /* header just renders without school identity */ });
  }

  private toShellSchool(raw: any): ShellSchool {
    const place = [raw?.city, raw?.state].filter(Boolean).join(', ');
    const meta = [raw?.board, place].filter(Boolean).join(' · ');
    return {
      name: raw?.schoolName || '',
      meta,
      initials: initialsOf(raw?.schoolName || ''),
      logoUrl: raw?.schoolLogo || null
    };
  }

  /**
   * The header's session selector — ONLY the v2 academic-session collection (shared-fix2.md).
   * Default: the user's remembered choice, else the session covering today, else the latest.
   * It must always have something to show: a school with no session at all degrades to the
   * current year rather than silently removing the control from every page.
   */
  private loadSessions(adminId: string | undefined, userId: string | undefined): void {
    const fallback = currentSessionLabel();
    this.patch({ sessions: [fallback], activeSession: fallback });
    if (!adminId) return;
    this.sessionStoreKey = `v2.session.${adminId}.${userId || adminId}`;

    this.academicSessionsService.getOptions(adminId).subscribe((res) => {
      const rows = (res?.sessions || []).filter((row) => row.label);
      if (!rows.length) return;
      let remembered: string | null = null;
      try { remembered = localStorage.getItem(this.sessionStoreKey); } catch { /* none */ }
      const chosen = pickHeaderSession(rows, remembered) || res.defaultLabel || rows[0].label;
      this.patch({ sessions: rows.map((row) => row.label), activeSession: chosen });
    }, () => { /* the fallback session above stays, rather than blanking the selector */ });
  }

  /**
   * The admin session's v2 Roles & Permissions grants, so the sidebar locks exactly what
   * the API refuses. A failed load leaves them null: nothing locks, and the API still
   * enforces every grant.
   */
  private loadV2Permissions(adminId: string | undefined): void {
    if (!adminId) return;
    this.rolesPermissionsService.getMyPermissions(adminId).subscribe((res) => {
      if (res) this.patch({ v2Permissions: res });
    }, () => { /* leave null — see above */ });
  }

  private loadTeacherPermissions(user: any): void {
    const cached = this.teacherAuthService.getPermissions();
    if (cached) {
      this.patch({ permissions: this.toShellPermissions(cached) });
      return;
    }
    if (!user?.adminId || !user?.id) return;

    this.teacherService.getTeacherById({ adminId: user.adminId, teacherUserId: user.id })
      .subscribe((res: any) => {
        if (!res) return;
        // Same cache the legacy side-nav fills, so this costs no extra request there.
        this.teacherAuthService.setPermissions(res);
        this.patch({ permissions: this.toShellPermissions(res) });
      }, () => { /* everything stays locked, which is the safe default */ });
  }

  private toShellPermissions(raw: any): Record<ShellPermissionKey, boolean> {
    const permissions = allPermissions(false);
    SHELL_PERMISSION_KEYS.forEach((key) => {
      permissions[key] = Boolean(raw?.[TEACHER_PERMISSION_FIELD[key]]?.status);
    });
    return permissions;
  }

  private patch(partial: Partial<ShellContext>): void {
    this.context$.next({ ...this.context$.value, ...partial });
  }
}
