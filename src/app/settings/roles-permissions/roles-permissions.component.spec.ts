import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { RolesPermissionsService } from 'src/app/shared/services/settings/roles-permissions.service';
import { ApiError } from 'src/app/shared/models/api-error.model';
import { MatrixResponse, Role, RolesResponse } from 'src/app/shared/models/settings/roles.model';
import { RolesPermissionsComponent } from './roles-permissions.component';

const MODULES = ['student', 'fees'];
const perms = (student: [boolean, boolean], fees: [boolean, boolean]) => [
  { module: 'student', canView: student[0], canEdit: student[1] },
  { module: 'fees', canView: fees[0], canEdit: fees[1] }
];
const SUPER: Role = { _id: 'r0', name: 'Super Admin', isSuperAdmin: true, isScoped: false,
  permissions: perms([true, true], [true, true]), holderCount: 1, holderNames: ['Owner'] };
const ACCT: Role = { _id: 'r1', name: 'Accountant', isSuperAdmin: false, isScoped: false,
  permissions: perms([true, false], [false, false]), holderCount: 2, holderNames: ['Meena', 'Ravi'] };
const CT: Role = { _id: 'r2', name: 'Class Teacher', isSuperAdmin: false, isScoped: true,
  permissions: perms([true, true], [false, false]), holderCount: 0, holderNames: [] };
const ROLES: RolesResponse = { roles: [SUPER, ACCT, CT], modules: MODULES };

const MATRIX: MatrixResponse = {
  rows: [
    { _id: 's0', name: 'Owner', empCode: null, department: 'Admin', designation: 'Owner', isOwner: true,
      assignments: [{ _id: 'a0', roleId: 'r0', scope: 'school', classId: null, streamId: null, sectionId: null, label: 'Whole school' }] },
    { _id: 's1', name: 'Priya Sharma', empCode: 'STF-1', department: 'Teaching', designation: 'Teacher', isOwner: false,
      assignments: [{ _id: 'a1', roleId: 'r2', scope: 'class', classId: 'c8', streamId: null, sectionId: 'sA', label: '8th · Section A' }] }
  ],
  nextCursor: null,
  filters: { departments: [{ name: 'Teaching', designations: ['Teacher'] }] },
  summary: { totalStaff: 2, assigned: 2, unassigned: 0 }
};

const apiError = (category: ApiError['category'], code: string, extra: Partial<ApiError> = {}): ApiError =>
  ({ category, code, message: 'msg ' + code, requestId: 'r', ...extra });

describe('RolesPermissionsComponent', () => {
  let fixture: ComponentFixture<RolesPermissionsComponent>;
  let component: RolesPermissionsComponent;
  let api: jasmine.SpyObj<RolesPermissionsService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<RolesPermissionsService>('RolesPermissionsService', [
      'getRoles', 'createRole', 'updateRolePermissions', 'deleteRole', 'getMatrix', 'getClassOptions',
      'createAssignment', 'updateAssignment', 'deleteAssignment', 'bulkDeleteAssignments'
    ]);
    api.getRoles.and.returnValue(of(ROLES));
    api.getMatrix.and.returnValue(of(MATRIX));
    api.getClassOptions.and.returnValue(of({ classes: [
      { _id: 'c8', label: '8th', hasStreams: false, sections: [{ _id: 'sA', label: 'A' }], streams: [] }
    ] }));

    await TestBed.configureTestingModule({
      declarations: [RolesPermissionsComponent],
      providers: [
        { provide: RolesPermissionsService, useValue: api },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(RolesPermissionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('opens on the first editable role, never Super Admin', () => {
    expect(component.selectedRoleId).toBe('r1');
  });

  it('SUPER_ADMIN_ROLE_PROTECTED: Super Admin`s permissions can`t be toggled or saved', () => {
    component.selectRole(SUPER);
    component.togglePermission('fees', 'view');
    expect(component.draft.find((p) => p.module === 'fees')?.canView).toBe(true);
    expect(component.permsDirty).toBe(false);
    component.onSaveRole();
    expect(api.updateRolePermissions).not.toHaveBeenCalled();
  });

  it('Edit implies View, the preview locks modules without View, and Save sends the draft', () => {
    api.updateRolePermissions.and.returnValue(of({ role: { ...ACCT, permissions: perms([true, false], [true, true]) } }));
    expect(component.previewLocked('fees')).toBe(true);
    component.togglePermission('fees', 'edit');
    expect(component.draft.find((p) => p.module === 'fees')).toEqual({ module: 'fees', canView: true, canEdit: true });
    expect(component.previewLocked('fees')).toBe(false);

    component.onSaveRole();
    expect(api.updateRolePermissions).toHaveBeenCalledWith('a1', 'r1', perms([true, false], [true, true]));
  });

  it('ROLE_IN_USE: removing a role still held is blocked upfront with the count', () => {
    component.onRemoveRole();
    expect(component.confirmConfig.blocked).toBe(true);
    expect(component.confirmConfig.message).toContain('2 staff members hold this role');
  });

  it('ROLE_NAME_DUPLICATE lands under the New Role name input', () => {
    api.createRole.and.returnValue(throwError(() => apiError('ConflictError', 'ROLE_NAME_DUPLICATE',
      { fields: [{ field: 'name', message: 'A role with this name already exists.', code: 'ROLE_NAME_DUPLICATE' }] })));
    component.onNewRole();
    expect(component.newRoleDisabled).toBe(true); // ROLE_NAME_REQUIRED: blank can't submit
    component.onNewRoleNameChange('Accountant');
    component.onNewRoleSubmit();
    expect(component.newRoleErrors['name']).toBe('A role with this name already exists.');
    expect(component.newRoleOpen).toBe(true);
  });

  it('OWNER_ROLE_PROTECTED: the owner`s Super Admin chip can`t be removed', () => {
    const owner = component.rows[0];
    expect(component.isOwnerChip(owner, SUPER)).toBe(true);
    component.onRemoveChip(owner, SUPER, owner.assignments[0]);
    expect(api.deleteAssignment).not.toHaveBeenCalled();
  });

  it('a whole-school role is added straight from the +, with no class', () => {
    api.createAssignment.and.returnValue(of({ assignment:
      { _id: 'a9', roleId: 'r1', scope: 'school' as const, classId: null, streamId: null, sectionId: null, label: 'Whole school' } }));
    const priya = component.rows[1];
    component.onAddChip(priya, ACCT);
    expect(api.createAssignment).toHaveBeenCalledWith('a1', 's1', 'r1', { classId: null, streamId: null, sectionId: null });
    expect(component.chipsFor(component.rows[1], ACCT).length).toBe(1);
    expect(component.canAdd(component.rows[1], ACCT)).toBe(false);
  });

  it('ROLE_SCOPE_ALREADY_ASSIGNED: the class modal stays open and says why', () => {
    api.createAssignment.and.returnValue(throwError(() => apiError('ConflictError', 'ROLE_SCOPE_ALREADY_ASSIGNED')));
    component.onAddChip(component.rows[1], CT);
    expect(component.scopeOpen).toBe(true);
    component.onScopeClassChange('c8');
    component.onScopeSectionChange('sA');
    component.onScopeSubmit();
    expect(api.createAssignment).toHaveBeenCalledWith('a1', 's1', 'r2', { classId: 'c8', streamId: null, sectionId: 'sA' });
    expect(component.scopeOpen).toBe(true);
    expect(component.scopeFormError).toBe('msg ROLE_SCOPE_ALREADY_ASSIGNED');
  });

  it('Selected Delete removes every chip of the selected staff and lists what was refused', () => {
    api.bulkDeleteAssignments.and.returnValue(of({ message: 'ok', deletedCount: 1, results: [
      { id: 'a0', status: 'failed' as const, code: 'OWNER_ROLE_PROTECTED', message: "The account owner's Super Admin access can't be removed." },
      { id: 'a1', status: 'deleted' as const }
    ] }));
    component.toggleAll();
    component.onBulkDelete();
    expect(component.confirmConfig.typeToConfirm).toBe('DELETE');
    component.onConfirmed();

    expect(api.bulkDeleteAssignments).toHaveBeenCalledWith('a1', ['a0', 'a1']);
    expect(component.bulkResultOpen).toBe(true);
    expect(component.bulkResultLines.length).toBe(1);
    expect(component.bulkResultLines[0].message).toContain('owner');
  });
});
