import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { AcademicSessionsService } from 'src/app/shared/services/settings/academic-sessions.service';
import { ApiError } from 'src/app/shared/models/api-error.model';
import { SessionListResponse } from 'src/app/shared/models/settings/academic-session.model';
import { AcademicSessionsComponent } from './academic-sessions.component';

const LIST: SessionListResponse = {
  rows: [
    { _id: 's1', label: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', status: 'active', isLocked: true },
    { _id: 's2', label: '2027-2028', startDate: '2027-04-01', endDate: '2028-03-31', status: 'upcoming', isLocked: false, blockingCount: 0 },
    { _id: 's3', label: '2028-2029', startDate: '2028-04-01', endDate: '2029-03-31', status: 'upcoming', isLocked: false, blockingCount: 4 }
  ],
  total: 3, page: 1, limit: 10,
  summary: { total: 3, activeLabel: '2026-2027' }
};

const apiError = (category: ApiError['category'], code: string, field?: string): ApiError => ({
  category, code, message: 'msg ' + code, requestId: 'r',
  ...(field ? { fields: [{ field, message: 'field ' + code, code }] } : {})
});

describe('AcademicSessionsComponent', () => {
  let fixture: ComponentFixture<AcademicSessionsComponent>;
  let component: AcademicSessionsComponent;
  let api: jasmine.SpyObj<AcademicSessionsService>;
  let shell: jasmine.SpyObj<ShellContextService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<AcademicSessionsService>('AcademicSessionsService',
      ['getSessions', 'getCopyForwardOptions', 'createSession', 'activateSession', 'deleteSession']);
    api.getSessions.and.returnValue(of(LIST));
    api.getCopyForwardOptions.and.returnValue(of({
      sourceLabel: '2026-2027',
      options: [
        { key: 'feeStructure', label: 'Fee Structure', available: true, reason: null },
        { key: 'salaryGroups', label: 'Salary Groups', available: false, reason: 'Later' }
      ]
    }));
    shell = jasmine.createSpyObj<ShellContextService>('ShellContextService', ['setActiveSession']);

    await TestBed.configureTestingModule({
      declarations: [AcademicSessionsComponent],
      providers: [
        { provide: AcademicSessionsService, useValue: api },
        { provide: ShellContextService, useValue: shell },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(AcademicSessionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates an upcoming session from dates only, copying forward only available types', () => {
    api.createSession.and.returnValue(of({ message: 'ok', session: LIST.rows[1], copyForward: [] }));
    component.onCreateSession();
    expect(component.isCopyChecked('feeStructure')).toBe(true);
    expect(component.isCopyChecked('salaryGroups')).toBe(false);

    component.onStartChange('2029-04-01');
    component.onEndChange('2030-03-31');
    expect(component.labelPreview).toBe('2029-2030');
    component.onCreateSubmit();

    expect(api.createSession).toHaveBeenCalledWith(
      { adminId: 'a1', startDate: '2029-04-01', endDate: '2030-03-31', copyForward: ['feeStructure'] },
      jasmine.any(String));
    expect(component.createOpen).toBe(false);
  });

  it('SESSION_DATE_RANGE_INVALID: an end before the start never reaches the server', () => {
    component.onCreateSession();
    component.onStartChange('2029-04-01');
    component.onEndChange('2029-03-01');
    component.onCreateSubmit();
    expect(api.createSession).not.toHaveBeenCalled();
    expect(component.createErrors['endDate']).toBe('Choose a valid session date range.');
  });

  it('SESSION_LABEL_DUPLICATE lands beside the date inputs and keeps the modal open', () => {
    api.createSession.and.returnValue(throwError(() => apiError('ConflictError', 'SESSION_LABEL_DUPLICATE', 'startDate')));
    component.onCreateSession();
    component.onStartChange('2027-04-01');
    component.onEndChange('2028-03-31');
    component.onCreateSubmit();
    expect(component.createErrors['startDate']).toBe('field SESSION_LABEL_DUPLICATE');
    expect(component.createOpen).toBe(true);
  });

  it('SESSION_COPY_FORWARD_PARTIAL: reports the failed types, the session still counts as created', () => {
    api.createSession.and.returnValue(of({
      message: 'ok', session: LIST.rows[1], copyForward: [],
      warning: { code: 'SESSION_COPY_FORWARD_PARTIAL', message: '1 of the selected item types couldn\'t be copied',
        rows: [{ row: 'feeStructure', label: 'Fee Structure', message: 'failed' }] }
    }));
    component.onCreateSession();
    component.onStartChange('2029-04-01');
    component.onEndChange('2030-03-31');
    component.onCreateSubmit();
    expect(component.createOpen).toBe(false);
    expect(component.partialOpen).toBe(true);
    expect(component.partialRows).toEqual([{ label: 'Fee Structure', message: 'failed' }]);
  });

  it('Set as Active stays disabled until the session`s own label is typed, then sends it', () => {
    api.activateSession.and.returnValue(of({ message: 'ok', session: LIST.rows[1], previousLabel: '2026-2027' }));
    component.onSetActive(LIST.rows[1]);
    component.onConfirmTextChange('DELETE');
    expect(component.activateDisabled).toBe(true);
    component.onConfirmTextChange('2027-2028');
    expect(component.activateDisabled).toBe(false);

    component.onActivateSubmit();
    expect(api.activateSession).toHaveBeenCalledWith('a1', 's2', '2027-2028');
    expect(shell.setActiveSession).toHaveBeenCalledWith('2027-2028');
  });

  it('SESSION_CONFIRM_MISMATCH from the server is shown under the confirm input', () => {
    api.activateSession.and.returnValue(throwError(() => apiError('ValidationError', 'SESSION_CONFIRM_MISMATCH', 'confirmLabel')));
    component.onSetActive(LIST.rows[1]);
    component.onConfirmTextChange('2027-2028');
    component.onActivateSubmit();
    expect(component.activateError).toBe('field SESSION_CONFIRM_MISMATCH');
    expect(component.activateOpen).toBe(true);
  });

  it('SESSION_ALREADY_ACTIVE (lost race): closes the modal and re-reads the list', () => {
    api.activateSession.and.returnValue(throwError(() => apiError('ConflictError', 'SESSION_ALREADY_ACTIVE')));
    api.getSessions.calls.reset();
    component.onSetActive(LIST.rows[1]);
    component.onConfirmTextChange('2027-2028');
    component.onActivateSubmit();
    expect(component.activateOpen).toBe(false);
    expect(api.getSessions).toHaveBeenCalled();
  });

  it('SESSION_IN_USE: the delete confirm is blocked upfront for a session with records', () => {
    component.onDeleteSession(LIST.rows[2]);
    expect(component.confirmConfig.blocked).toBe(true);
    component.onDeleteSession(LIST.rows[1]);
    expect(component.confirmConfig.blocked).toBe(false);
    expect(component.confirmConfig.typeToConfirm).toBe('DELETE');
  });

  it('a failed load is an error state with retry, not the empty state', () => {
    api.getSessions.and.returnValue(throwError(() => new Error('down')));
    component.fetchSessions();
    expect(component.loadError).toContain("Couldn't load");
    expect(component.rows.length).toBe(0);
  });
});
