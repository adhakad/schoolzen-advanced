/**
 * Settings → Roles & Permissions — two steps, two data shapes:
 *   Step 1: what each Role can do (per-module View/Edit), previewed as the sidebar it unlocks.
 *   Step 2: who holds each role, for which class (RoleAssignment chips in a staff × role matrix).
 *
 * Reference: docs/schoolzen-planning/v1/settings/roles-permissions.html (+ .md, errors.md Page 3)
 *
 * The protections (Super Admin role, the owner's Super Admin chip, one person per
 * class+role) are enforced by the server; the UI mirrors them so the admin sees them upfront.
 * Every chip/cell has its own in-flight flag — one cell saving never blocks another.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ConfirmConfig, DdOption } from 'src/app/shared/models/shared-components.model';
import { RolesPermissionsService } from 'src/app/shared/services/settings/roles-permissions.service';
import {
  ClassScopeNode, MatrixResponse, MatrixStaffRow, ModulePermission, Role, RoleAssignment, ScopeOption
} from 'src/app/shared/models/settings/roles.model';
import { settingsFormErrors } from 'src/app/shared/utils/settings-errors.util';
import { toApiError } from 'src/app/shared/utils/api-error.util';
import { avatarGradient, initialsOf } from 'src/app/shared/utils/avatar.util';
import { BulkOutcomeLine } from 'src/app/shared/models/academic-setup/bulk-delete.model';

const MODULE_LABELS: Readonly<Record<string, string>> = {
  student: 'Student', attendance: 'Attendance', marksheet: 'Marksheet', leave: 'Leave', 'leave-limit': 'Leave Limits',
  fees: 'Fees', payroll: 'Payroll', settings: 'Settings'
};
const MODULE_ICONS: Readonly<Record<string, string>> = {
  student: 'mortarboard', attendance: 'calendar-check', marksheet: 'journal-text', leave: 'calendar-plus', 'leave-limit': 'sliders',
  fees: 'wallet2', payroll: 'cash-stack', settings: 'gear'
};
const SCOPE_FIELDS: readonly string[] = ['classId', 'streamId', 'sectionId', 'staffId'];
const PAGE_SIZE = 25;

@Component({
  selector: 'app-roles-permissions',
  templateUrl: './roles-permissions.component.html',
  styleUrls: ['./roles-permissions.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RolesPermissionsComponent implements OnInit, OnDestroy {
  adminId = '';

  // --- Step 1 ---
  rolesLoading = true;
  rolesError = '';
  roles: Role[] = [];
  modules: string[] = [];
  selectedRoleId = '';
  /** The selected role's permissions as being edited — saved by "Save Changes to <role>". */
  draft: ModulePermission[] = [];
  savingRole = false;

  newRoleOpen = false;
  newRoleName = '';
  newRoleScoped = false;
  newRoleSaving = false;
  newRoleErrors: Record<string, string> = {};
  newRoleFormError = '';

  // --- Step 2 ---
  matrixLoading = true;
  matrixError = '';
  rows: MatrixStaffRow[] = [];
  nextCursor: string | null = null;
  loadingMore = false;
  summary = { totalStaff: 0, assigned: 0, unassigned: 0 };
  search = '';
  department = '';
  designation = '';
  roleFilter = '';
  assignedFilter: '' | 'assigned' | 'unassigned' = '';
  departmentOptions: DdOption[] = [{ value: '', label: 'All departments' }];
  private designationsByDept = new Map<string, string[]>();
  readonly assignedOptions: readonly DdOption[] = [
    { value: '', label: 'Assigned + Unassigned' },
    { value: 'assigned', label: 'Assigned only' },
    { value: 'unassigned', label: 'Unassigned only' }
  ];
  selectedStaff = new Set<string>();
  /** In-flight keys: `cell:<staffId>:<roleId>` for an add, `chip:<assignmentId>` for a remove. */
  busy = new Set<string>();

  // Scope modal (add a class / edit a chip's class)
  scopeOpen = false;
  scopeMode: 'add' | 'edit' = 'add';
  scopeRole: Role | null = null;
  scopeStaffId = '';
  scopeAssignment: RoleAssignment | null = null;
  scopeClassId = '';
  scopeStreamId = '';
  scopeSectionId = '';
  scopeSaving = false;
  scopeErrors: Record<string, string> = {};
  scopeFormError = '';
  classTree: ClassScopeNode[] = [];
  classTreeLoaded = false;
  classTreeError = false;

  // Confirm (remove role / bulk delete)
  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: 'Remove' };
  private confirmAction: 'role' | 'bulk' | null = null;
  bulkResultOpen = false;
  bulkResultSummary = '';
  bulkResultLines: BulkOutcomeLine[] = [];

  private search$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private rolesService: RolesPermissionsService,
    private adminAuthService: AdminAuthService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.adminId = this.adminAuthService.getLoggedInAdminInfo()?.id || '';
    if (!this.adminId) {
      this.rolesLoading = false;
      this.matrixLoading = false;
      return;
    }
    this.search$.pipe(debounceTime(250), distinctUntilChanged(), takeUntil(this.destroyed$)).subscribe((value) => {
      this.search = value;
      this.fetchMatrix();
    });
    this.fetchRoles();
    this.fetchMatrix();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  // =====================================================================================
  // Step 1 — roles
  // =====================================================================================

  fetchRoles(selectId?: string): void {
    this.rolesLoading = true;
    this.rolesError = '';
    this.rolesService.getRoles(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.roles = res.roles || [];
      this.modules = res.modules || [];
      const keep = selectId || this.selectedRoleId;
      const next = this.roles.find((r) => r._id === keep)
        || this.roles.find((r) => !r.isSuperAdmin) || this.roles[0];
      if (next) this.selectRole(next);
      this.rolesLoading = false;
      this.cdr.markForCheck();
    }, () => {
      this.rolesError = "Couldn't load roles.";
      this.rolesLoading = false;
      this.cdr.markForCheck();
    });
  }

  trackById = (_index: number, item: { _id: string }): string => item._id;
  trackByModule = (_index: number, perm: ModulePermission): string => perm.module;

  get selectedRole(): Role | undefined {
    return this.roles.find((role) => role._id === this.selectedRoleId);
  }

  get roleOptions(): DdOption[] {
    return [{ value: '', label: 'All roles' }, ...this.roles.map((role) => ({ value: role._id, label: role.name }))];
  }

  moduleLabel(module: string): string {
    return MODULE_LABELS[module] || module;
  }

  moduleIcon(module: string): string {
    return MODULE_ICONS[module] || 'circle';
  }

  selectRole(role: Role): void {
    this.selectedRoleId = role._id;
    this.draft = this.modules.map((module) => {
      const p = role.permissions.find((perm) => perm.module === module);
      return { module, canView: !!p?.canView || !!p?.canEdit, canEdit: !!p?.canEdit };
    });
  }

  /** Edit implies View; turning View off turns Edit off. */
  togglePermission(module: string, action: 'view' | 'edit'): void {
    const role = this.selectedRole;
    if (!role || role.isSuperAdmin) return;
    this.draft = this.draft.map((perm) => {
      if (perm.module !== module) return perm;
      if (action === 'edit') {
        const canEdit = !perm.canEdit;
        return { module, canEdit, canView: canEdit || perm.canView };
      }
      const canView = !perm.canView;
      return { module, canView, canEdit: canView && perm.canEdit };
    });
  }

  get permsDirty(): boolean {
    const role = this.selectedRole;
    if (!role || role.isSuperAdmin) return false;
    return this.draft.some((perm) => {
      const saved = role.permissions.find((p) => p.module === perm.module);
      return !!saved?.canView !== perm.canView || !!saved?.canEdit !== perm.canEdit;
    });
  }

  /** The sidebar preview: Super Admin sees everything; others lock modules without View. */
  previewLocked(module: string): boolean {
    const role = this.selectedRole;
    if (!role || role.isSuperAdmin) return false;
    return !this.draft.find((perm) => perm.module === module)?.canView;
  }

  onSaveRole(): void {
    const role = this.selectedRole;
    if (!role || role.isSuperAdmin || this.savingRole || !this.permsDirty) return;
    this.savingRole = true;
    this.rolesService.updateRolePermissions(this.adminId, role._id, this.draft)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.savingRole = false;
        this.roles = this.roles.map((r) => (r._id === role._id ? { ...r, ...res.role, holderCount: r.holderCount, holderNames: r.holderNames } : r));
        this.selectRole(this.selectedRole || role);
        this.snackBar.open(role.name + ' permissions saved.', 'Dismiss', { duration: 4000 });
        this.cdr.markForCheck();
      }, () => {
        // SUPER_ADMIN_ROLE_PROTECTED / NOT_FOUND are toasted by the interceptor.
        this.savingRole = false;
        this.cdr.markForCheck();
      });
  }

  // --- new role ---

  onNewRole(): void {
    this.newRoleName = '';
    this.newRoleScoped = false;
    this.newRoleErrors = {};
    this.newRoleFormError = '';
    this.newRoleSaving = false;
    this.newRoleOpen = true;
  }

  onNewRoleNameChange(value: string): void {
    this.newRoleName = value;
    delete this.newRoleErrors['name'];
  }

  get newRoleDisabled(): boolean {
    return this.newRoleSaving || !this.newRoleName.trim();
  }

  onNewRoleSubmit(): void {
    if (this.newRoleDisabled) return;
    this.newRoleSaving = true;
    this.newRoleErrors = {};
    this.newRoleFormError = '';
    this.rolesService.createRole(this.adminId, this.newRoleName.trim(), this.newRoleScoped)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.newRoleSaving = false;
        this.newRoleOpen = false;
        this.fetchRoles(res.role?._id);
      }, (error: unknown) => {
        this.newRoleSaving = false;
        const inline = settingsFormErrors(error, ['name']);
        if (inline) {
          this.newRoleErrors = inline.fields;
          this.newRoleFormError = inline.formError;
        }
        this.cdr.markForCheck();
      });
  }

  // --- remove role ---

  onRemoveRole(): void {
    const role = this.selectedRole;
    if (!role || role.isSuperAdmin) return;
    const count = role.holderCount || 0;
    const names = role.holderNames.length
      ? role.holderNames.join(', ') + (count > role.holderNames.length ? ' and ' + (count - role.holderNames.length) + ' more' : '')
      : '';
    this.confirmAction = 'role';
    this.confirmConfig = count > 0
      ? {
        title: 'Remove ' + role.name,
        message: count + (count === 1 ? ' staff member holds' : ' staff members hold') + ' this role — reassign them first.',
        scopeNote: names || undefined,
        confirmLabel: 'Remove',
        cancelLabel: 'Close',
        variant: 'warning',
        blocked: true
      }
      : { title: 'Remove ' + role.name + '?', message: "This can't be undone.", confirmLabel: 'Remove', variant: 'warning' };
    this.confirmOpen = true;
  }

  private removeRole(): void {
    const role = this.selectedRole;
    if (!role || this.savingRole) return;
    this.savingRole = true;
    this.rolesService.deleteRole(this.adminId, role._id).pipe(takeUntil(this.destroyed$)).subscribe(() => {
      this.savingRole = false;
      this.selectedRoleId = '';
      if (this.roleFilter === role._id) this.roleFilter = '';
      this.snackBar.open(role.name + ' removed.', 'Dismiss', { duration: 4000 });
      this.fetchRoles();
      this.fetchMatrix();
    }, () => {
      // ROLE_IN_USE (someone was just assigned) — re-read the real counts.
      this.savingRole = false;
      this.fetchRoles(role._id);
    });
  }

  // =====================================================================================
  // Step 2 — matrix
  // =====================================================================================

  fetchMatrix(): void {
    this.matrixLoading = true;
    this.matrixError = '';
    this.rolesService.getMatrix(this.adminId, this.matrixQuery()).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.rows = res.rows || [];
      this.nextCursor = res.nextCursor;
      this.applyMatrixMeta(res.filters?.departments || [], res.summary);
      // A selection never outlives a refetch that no longer shows those rows.
      const visible = new Set(this.rows.map((row) => row._id));
      this.selectedStaff.forEach((id) => { if (!visible.has(id)) this.selectedStaff.delete(id); });
      this.matrixLoading = false;
      this.cdr.markForCheck();
    }, () => {
      this.rows = [];
      this.matrixError = "Couldn't load staff roles.";
      this.matrixLoading = false;
      this.cdr.markForCheck();
    });
  }

  loadMore(): void {
    if (!this.nextCursor || this.loadingMore) return;
    this.loadingMore = true;
    this.rolesService.getMatrix(this.adminId, { ...this.matrixQuery(), cursor: this.nextCursor })
      .pipe(takeUntil(this.destroyed$))
      .subscribe((res) => {
        this.rows = [...this.rows, ...(res.rows || [])];
        this.nextCursor = res.nextCursor;
        this.loadingMore = false;
        this.cdr.markForCheck();
      }, () => {
        this.loadingMore = false;
        this.cdr.markForCheck();
      });
  }

  private matrixQuery() {
    return {
      search: this.search, department: this.department, designation: this.designation,
      roleId: this.roleFilter, assigned: this.assignedFilter, limit: PAGE_SIZE
    };
  }

  private applyMatrixMeta(departments: { name: string; designations: string[] }[], summary?: MatrixResponse['summary']): void {
    this.departmentOptions = [{ value: '', label: 'All departments' },
      ...departments.map((d) => ({ value: d.name, label: d.name }))];
    this.designationsByDept = new Map(departments.map((d) => [d.name, d.designations]));
    if (summary) this.summary = summary;
  }

  get designationOptions(): DdOption[] {
    return [{ value: '', label: 'All designations' },
      ...(this.designationsByDept.get(this.department) || []).map((d) => ({ value: d, label: d }))];
  }

  onSearchChange(value: string): void {
    this.search$.next(value);
  }

  onDepartmentChange(value: string): void {
    this.department = value;
    this.designation = '';
    this.fetchMatrix();
  }

  onDesignationChange(value: string): void {
    this.designation = value;
    this.fetchMatrix();
  }

  onRoleFilterChange(value: string): void {
    this.roleFilter = value;
    this.fetchMatrix();
  }

  onAssignedFilterChange(value: string): void {
    this.assignedFilter = value === 'assigned' || value === 'unassigned' ? value : '';
    this.fetchMatrix();
  }

  initials(name: string): string {
    return initialsOf(name);
  }

  gradient(seed: string): string {
    return avatarGradient(seed);
  }

  staffSub(row: MatrixStaffRow): string {
    const where = [row.designation, row.department].filter(Boolean).join(', ');
    return [row.empCode, where].filter(Boolean).join(' · ');
  }

  chipsFor(row: MatrixStaffRow, role: Role): RoleAssignment[] {
    return row.assignments.filter((a) => a.roleId === role._id);
  }

  /** Non-scoped roles are held once per person — the + disappears once it's held. */
  canAdd(row: MatrixStaffRow, role: Role): boolean {
    return role.isScoped || !this.chipsFor(row, role).length;
  }

  isOwnerChip(row: MatrixStaffRow, role: Role): boolean {
    return row.isOwner && role.isSuperAdmin;
  }

  chipLabel(role: Role, chip: RoleAssignment): string {
    return chip.scope === 'school' ? role.name + ' · Whole school' : chip.label;
  }

  isBusy(key: string): boolean {
    return this.busy.has(key);
  }

  // --- selection / bulk ---

  isSelected(id: string): boolean {
    return this.selectedStaff.has(id);
  }

  toggleRow(id: string): void {
    if (this.selectedStaff.has(id)) this.selectedStaff.delete(id);
    else this.selectedStaff.add(id);
  }

  get allSelected(): boolean {
    return this.rows.length > 0 && this.rows.every((row) => this.selectedStaff.has(row._id));
  }

  toggleAll(): void {
    const on = !this.allSelected;
    this.rows.forEach((row) => (on ? this.selectedStaff.add(row._id) : this.selectedStaff.delete(row._id)));
  }

  get selectedCount(): number {
    return this.selectedStaff.size;
  }

  onBulkDelete(): void {
    const picked = this.rows.filter((row) => this.selectedStaff.has(row._id));
    if (!picked.length) return;
    const total = picked.reduce((sum, row) => sum + row.assignments.length, 0);
    const owner = picked.some((row) => row.isOwner);
    this.confirmAction = 'bulk';
    this.confirmConfig = {
      title: 'Selected Delete',
      message: total
        ? "Removing every role currently held by " + picked.map((row) => row.name).join(', ') + " can't be undone."
        : 'The selected staff hold no roles.',
      scopeNote: owner ? "The account owner's Super Admin access is kept — it can't be removed." : undefined,
      confirmLabel: 'Remove All',
      variant: 'warning',
      typeToConfirm: 'DELETE',
      blocked: total === 0
    };
    this.confirmOpen = true;
  }

  private bulkDelete(): void {
    const picked = this.rows.filter((row) => this.selectedStaff.has(row._id));
    const ids = picked.flatMap((row) => row.assignments.map((a) => a._id));
    if (!ids.length || this.busy.has('bulk')) return;
    const labelOf = new Map<string, string>();
    picked.forEach((row) => row.assignments.forEach((a) => {
      const role = this.roles.find((r) => r._id === a.roleId);
      labelOf.set(a._id, row.name + ' — ' + (role ? this.chipLabel(role, a) : a.label));
    }));
    this.busy.add('bulk');
    this.rolesService.bulkDeleteAssignments(this.adminId, ids).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.busy.delete('bulk');
      const failed = (res.results || []).filter((r) => r.status !== 'deleted');
      this.selectedStaff.clear();
      if (failed.length) {
        this.bulkResultSummary = res.deletedCount + ' of ' + ids.length + ' role assignments removed.';
        this.bulkResultLines = failed.map((r) => ({ id: r.id, label: labelOf.get(r.id) || r.id, message: r.message || '' }));
        this.bulkResultOpen = true;
      } else {
        this.snackBar.open(res.message || 'Roles removed.', 'Dismiss', { duration: 4000 });
      }
      this.fetchMatrix();
      this.fetchRoles();
    }, () => {
      this.busy.delete('bulk');
      this.cdr.markForCheck();
    });
  }

  closeBulkResult(): void {
    this.bulkResultOpen = false;
  }

  // --- confirm dispatch ---

  onConfirmed(): void {
    this.confirmOpen = false;
    const action = this.confirmAction;
    this.confirmAction = null;
    if (action === 'role') this.removeRole();
    if (action === 'bulk') this.bulkDelete();
  }

  onConfirmCancelled(): void {
    this.confirmOpen = false;
    this.confirmAction = null;
  }

  // --- chips ---

  /** The dotted +: a non-scoped role is added straight away; a scoped one asks for a class. */
  onAddChip(row: MatrixStaffRow, role: Role): void {
    if (!role.isScoped) {
      const key = 'cell:' + row._id + ':' + role._id;
      if (this.busy.has(key)) return;
      this.busy.add(key);
      this.rolesService.createAssignment(this.adminId, row._id, role._id, { classId: null, streamId: null, sectionId: null })
        .pipe(takeUntil(this.destroyed$))
        .subscribe((res) => {
          this.busy.delete(key);
          this.patchRow(row._id, (r) => ({ ...r, assignments: [...r.assignments, res.assignment] }));
          this.refreshCounts();
        }, () => {
          this.busy.delete(key);
          this.cdr.markForCheck();
        });
      return;
    }
    this.openScope('add', role, row._id, null);
  }

  onEditChip(row: MatrixStaffRow, role: Role, chip: RoleAssignment): void {
    if (!role.isScoped || chip.scope !== 'class') return;
    this.openScope('edit', role, row._id, chip);
  }

  onRemoveChip(row: MatrixStaffRow, role: Role, chip: RoleAssignment): void {
    if (this.isOwnerChip(row, role)) return;
    const key = 'chip:' + chip._id;
    if (this.busy.has(key)) return;
    this.busy.add(key);
    this.rolesService.deleteAssignment(this.adminId, chip._id).pipe(takeUntil(this.destroyed$)).subscribe(() => {
      this.busy.delete(key);
      this.patchRow(row._id, (r) => ({ ...r, assignments: r.assignments.filter((a) => a._id !== chip._id) }));
      this.refreshCounts();
    }, () => {
      // OWNER_ROLE_PROTECTED / NOT_FOUND toasted — re-read this page of rows.
      this.busy.delete(key);
      this.fetchMatrix();
    });
  }

  private patchRow(staffId: string, update: (row: MatrixStaffRow) => MatrixStaffRow): void {
    this.rows = this.rows.map((row) => (row._id === staffId ? update(row) : row));
    this.cdr.markForCheck();
  }

  /** Side-card counts and each role's holder count change with any chip add/remove. */
  private refreshCounts(): void {
    this.rolesService.getRoles(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      const byId = new Map((res.roles || []).map((r) => [r._id, r]));
      this.roles = this.roles.map((r) => {
        const fresh = byId.get(r._id);
        return fresh ? { ...r, holderCount: fresh.holderCount, holderNames: fresh.holderNames } : r;
      });
      this.cdr.markForCheck();
    }, () => undefined);
    this.rolesService.getMatrix(this.adminId, { limit: 1 }).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      if (res.summary) this.summary = res.summary;
      this.cdr.markForCheck();
    }, () => undefined);
  }

  // --- scope modal ---

  private openScope(mode: 'add' | 'edit', role: Role, staffId: string, chip: RoleAssignment | null): void {
    this.scopeMode = mode;
    this.scopeRole = role;
    this.scopeStaffId = staffId;
    this.scopeAssignment = chip;
    this.scopeClassId = chip?.classId || '';
    this.scopeStreamId = chip?.streamId || '';
    this.scopeSectionId = chip?.sectionId || '';
    this.scopeErrors = {};
    this.scopeFormError = '';
    this.scopeSaving = false;
    this.scopeOpen = true;
    if (!this.classTreeLoaded) this.loadClassTree();
  }

  private loadClassTree(): void {
    this.classTreeError = false;
    this.rolesService.getClassOptions(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.classTree = res.classes || [];
      this.classTreeLoaded = true;
      this.cdr.markForCheck();
    }, () => {
      this.classTreeError = true;
      this.cdr.markForCheck();
    });
  }

  openScopeRetry(): void {
    this.loadClassTree();
  }

  get scopeTitle(): string {
    return (this.scopeMode === 'add' ? 'Add a Class — ' : 'Edit Class — ') + (this.scopeRole?.name || '');
  }

  private get scopeClass(): ClassScopeNode | undefined {
    return this.classTree.find((cls) => cls._id === this.scopeClassId);
  }

  get classOptions(): DdOption[] {
    return [{ value: '', label: '-- Select --' }, ...this.classTree.map((cls) => ({ value: cls._id, label: cls.label }))];
  }

  get streamDisabled(): boolean {
    return !this.scopeClass?.hasStreams;
  }

  get streamOptions(): DdOption[] {
    const cls = this.scopeClass;
    if (!cls?.hasStreams) return [{ value: '', label: 'N/A' }];
    return [{ value: '', label: 'All streams' }, ...cls.streams.map((st) => ({ value: st._id, label: st.label }))];
  }

  get sectionDisabled(): boolean {
    const cls = this.scopeClass;
    if (!cls) return true;
    return cls.hasStreams ? !this.scopeStreamId : !cls.sections.length;
  }

  get sectionOptions(): DdOption[] {
    const cls = this.scopeClass;
    let sections: ScopeOption[] = [];
    if (cls) sections = cls.hasStreams ? (cls.streams.find((st) => st._id === this.scopeStreamId)?.sections || []) : cls.sections;
    return [{ value: '', label: 'All sections' }, ...sections.map((s) => ({ value: s._id, label: 'Section ' + s.label }))];
  }

  get staffOptions(): DdOption[] {
    return this.rows.map((row) => ({ value: row._id, label: row.name }));
  }

  onScopeClassChange(value: string): void {
    this.scopeClassId = value;
    this.scopeStreamId = '';
    this.scopeSectionId = '';
    this.scopeErrors = {};
    this.scopeFormError = '';
  }

  onScopeStreamChange(value: string): void {
    this.scopeStreamId = value;
    this.scopeSectionId = '';
    this.scopeFormError = '';
  }

  onScopeSectionChange(value: string): void {
    this.scopeSectionId = value;
    this.scopeFormError = '';
  }

  onScopeStaffChange(value: string): void {
    this.scopeStaffId = value;
    this.scopeFormError = '';
  }

  get scopeSubmitDisabled(): boolean {
    return this.scopeSaving || !this.scopeClassId || !this.scopeStaffId;
  }

  onScopeCancel(): void {
    this.scopeOpen = false;
  }

  onScopeSubmit(): void {
    const role = this.scopeRole;
    if (!role || this.scopeSubmitDisabled) return;
    const scope = {
      classId: this.scopeClassId || null,
      streamId: this.scopeStreamId || null,
      sectionId: this.scopeSectionId || null
    };
    this.scopeSaving = true;
    this.scopeErrors = {};
    this.scopeFormError = '';

    const request = this.scopeMode === 'edit' && this.scopeAssignment
      ? this.rolesService.updateAssignment(this.adminId, this.scopeAssignment._id, scope)
      : this.rolesService.createAssignment(this.adminId, this.scopeStaffId, role._id, scope);

    request.pipe(takeUntil(this.destroyed$)).subscribe(() => {
      this.scopeSaving = false;
      this.scopeOpen = false;
      this.fetchMatrix();
      this.refreshCounts();
    }, (error: unknown) => {
      this.scopeSaving = false;
      // Inline: field errors (STREAM_REQUIRED, ROLE_SCOPE_NOT_ALLOWED…). A conflict with no
      // field (ROLE_SCOPE_ALREADY_ASSIGNED) is toasted AND kept in the modal so it's seen
      // where the choice was made.
      const inline = settingsFormErrors(error, SCOPE_FIELDS);
      if (inline) {
        this.scopeErrors = inline.fields;
        this.scopeFormError = inline.formError;
      } else {
        const apiError = toApiError(error);
        if (apiError?.code === 'ROLE_SCOPE_ALREADY_ASSIGNED') this.scopeFormError = apiError.message;
      }
      this.cdr.markForCheck();
    });
  }
}
