/**
 * The single adapter the app shell reads for "who is logged in, at which school, in
 * which session, with which permissions".
 *
 * It composes what already exists — AdminAuthService / TeacherAuthService (the eight
 * legacy `<key>Permission.status` booleans), SchoolService, AcademicSessionService —
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
import { AcademicSessionService } from 'src/app/services/academic-session.service';
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

  constructor(
    private adminAuthService: AdminAuthService,
    private teacherAuthService: TeacherAuthService,
    private schoolService: SchoolService,
    private teacherService: TeacherService,
    private academicSessionService: AcademicSessionService
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
    this.loadSessions();
    if (role === 'teacher') this.loadTeacherPermissions(user);
  }

  setActiveSession(session: string): void {
    this.patch({ activeSession: session });
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

  private loadSessions(): void {
    this.academicSessionService.getAcademicSession().subscribe((res: any) => {
      if (!res) return;
      const sessions: string[] = (res.allSession?.length ? res.allSession : [res.academicSession])
        .filter(Boolean);
      this.patch({
        sessions,
        activeSession: res.academicSession || sessions[0] || ''
      });
    }, () => { /* selector renders empty rather than blocking the shell */ });
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
