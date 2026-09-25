import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ApiError } from 'src/app/shared/models/api-error.model';
import { SubjectsService } from 'src/app/shared/services/academic-setup/subjects.service';
import { SubjectListResponse } from 'src/app/shared/models/academic-setup/subject.model';
import { SubjectsComponent } from './subjects.component';

const RESPONSE: SubjectListResponse = {
  rows: [
    { _id: 's1', name: 'Hindi', type: 'core', status: 'active' },
    { _id: 's2', name: 'Computer Science', type: 'elective', status: 'active' },
    { _id: 's3', name: 'Sanskrit', type: 'elective', status: 'inactive' }
  ],
  total: 3,
  page: 1,
  limit: 10,
  summary: { total: 8, core: 5, elective: 3, inactive: 1 }
};

describe('SubjectsComponent', () => {
  let fixture: ComponentFixture<SubjectsComponent>;
  let component: SubjectsComponent;
  let api: jasmine.SpyObj<SubjectsService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<SubjectsService>('SubjectsService', [
      'getSubjects', 'createSubject', 'updateSubject', 'bulkDelete'
    ]);
    api.getSubjects.and.returnValue(of(RESPONSE));
    api.createSubject.and.returnValue(of('ok'));
    api.updateSubject.and.returnValue(of('ok'));
    api.bulkDelete.and.returnValue(of('ok'));

    await TestBed.configureTestingModule({
      declarations: [SubjectsComponent],
      providers: [
        { provide: SubjectsService, useValue: api },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(SubjectsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // --- list ---------------------------------------------------------------------------

  it('loads the first page on init, scoped to the school', () => {
    expect(api.getSubjects).toHaveBeenCalledWith('a1', { search: '', page: 1, limit: 10 });
    expect(component.rows.length).toBe(3);
    expect(component.total).toBe(3);
    expect(component.loading).toBe(false);
  });

  /**
   * The side card is school-wide and comes from the SAME aggregation as the rows, so it can
   * never disagree with the table — and it is deliberately not narrowed by the search box.
   */
  it('takes the side card`s counts from the list response, not a second request', () => {
    expect(component.summary).toEqual({ total: 8, core: 5, elective: 3, inactive: 1 });
    expect(api.getSubjects).toHaveBeenCalledTimes(1);
  });

  it('debounces typing into one request and resets to the first page', fakeAsync(() => {
    api.getSubjects.calls.reset();
    component.onPageChange(2);
    api.getSubjects.calls.reset();

    component.onSearchChange('h');
    component.onSearchChange('hi');
    component.onSearchChange('hin');
    expect(api.getSubjects).not.toHaveBeenCalled();

    tick(250);

    expect(api.getSubjects).toHaveBeenCalledTimes(1);
    expect(api.getSubjects).toHaveBeenCalledWith('a1', { search: 'hin', page: 1, limit: 10 });
    expect(component.page).toBe(1);
  }));

  it('refetches on a page or rows-per-page change, since the list is server-paged', () => {
    api.getSubjects.calls.reset();

    component.onPageChange(2);
    expect(api.getSubjects).toHaveBeenCalledWith('a1', { search: '', page: 2, limit: 10 });

    component.onLimitChange(25);
    expect(api.getSubjects).toHaveBeenCalledWith('a1', { search: '', page: 1, limit: 25 });
  });

  // --- selection ----------------------------------------------------------------------

  it('arms Delete Selected only once something is checked', () => {
    expect(component.selectedCount).toBe(0);

    component.toggleRow('s1');
    expect(component.isSelected('s1')).toBe(true);

    component.toggleRow('s1');
    expect(component.selectedCount).toBe(0);
  });

  it('select-all covers the visible rows and toggles back off', () => {
    component.toggleAll();
    expect(component.allSelected).toBe(true);
    expect(component.selectedCount).toBe(3);

    component.toggleAll();
    expect(component.selectedCount).toBe(0);
  });

  // --- form ---------------------------------------------------------------------------

  it('opens Add with the reference`s defaults — Core and Active', () => {
    component.onAddSubject();

    expect(component.formTitle).toBe('Add Subject');
    expect(component.form).toEqual({ id: null, name: '', type: 'core', status: 'active' });
  });

  it('seeds Edit from the row it was opened on', () => {
    component.onEditSubject(RESPONSE.rows[2]);

    expect(component.formTitle).toBe('Edit Subject');
    expect(component.form).toEqual({
      id: 's3', name: 'Sanskrit', type: 'elective', status: 'inactive'
    });
  });

  it('keeps Submit disabled until the name has content', () => {
    component.onAddSubject();
    expect(component.submitDisabled).toBe(true);

    component.onNameChange('   ');
    expect(component.submitDisabled).toBe(true);

    component.onNameChange('Biology');
    expect(component.submitDisabled).toBe(false);
  });

  it('creates with a trimmed name and the chosen type and status', () => {
    component.onAddSubject();
    component.onNameChange('  Biology  ');
    component.onTypeChange('elective');
    component.onStatusChange('inactive');
    component.onFormSubmit();

    expect(api.createSubject).toHaveBeenCalledWith({
      adminId: 'a1', name: 'Biology', type: 'elective', status: 'inactive'
    });
  });

  it('updates by id when the modal was opened on an existing subject', () => {
    component.onEditSubject(RESPONSE.rows[0]);
    component.onNameChange('Hindi Literature');
    component.onFormSubmit();

    expect(api.updateSubject).toHaveBeenCalledWith('s1', jasmine.objectContaining({
      name: 'Hindi Literature', type: 'core', status: 'active'
    }));
    expect(api.createSubject).not.toHaveBeenCalled();
  });

  it('refetches after a successful save so the counts move with the table', () => {
    api.getSubjects.calls.reset();

    component.onAddSubject();
    component.onNameChange('Biology');
    component.onFormSubmit();

    expect(component.formOpen).toBe(false);
    expect(api.getSubjects).toHaveBeenCalledTimes(1);
  });

  /**
   * ErrorInterceptor rethrows the SHAPED ApiError, not the HttpErrorResponse it arrived in;
   * only ValidationError is left to the page, so its fields land beside the inputs.
   */
  it('binds a ValidationError`s fields and leaves the modal open', () => {
    api.createSubject.and.returnValue(throwError(() => ({
      category: 'ValidationError',
      message: 'Please fix the highlighted fields',
      fields: [{ field: 'name', message: 'Subject name cannot be blank' }],
      requestId: 'r1'
    } as ApiError)));

    component.onAddSubject();
    component.onNameChange('Biology');
    component.onFormSubmit();

    expect(component.fieldErrors['name']).toBe('Subject name cannot be blank');
    expect(component.formOpen).toBe(true);
    expect(component.saving).toBe(false);
  });

  it('leaves a non-validation rejection to the interceptor and just stops saving', () => {
    api.createSubject.and.returnValue(throwError(() => ({
      category: 'ConflictError',
      message: 'Biology is already in this school`s subject list.',
      requestId: 'r2'
    } as ApiError)));

    component.onAddSubject();
    component.onNameChange('Biology');
    component.onFormSubmit();

    expect(component.fieldErrors).toEqual({});
    expect(component.formError).toBe('');
    expect(component.saving).toBe(false);
  });

  // --- delete -------------------------------------------------------------------------

  it('demands DELETE typed and warns about the groups that use the subject', () => {
    component.onDeleteSubject(RESPONSE.rows[0]);

    expect(component.confirmOpen).toBe(true);
    expect(component.confirmConfig.title).toBe('Delete 1 subject?');
    expect(component.confirmConfig.typeToConfirm).toBe('DELETE');
    expect(component.confirmConfig.message)
      .toContain('Any Subject Group that includes it will need to be updated.');
    expect(api.bulkDelete).not.toHaveBeenCalled();
  });

  it('sends a whole selection as ONE bulk request, not a call per row', () => {
    component.toggleRow('s1');
    component.toggleRow('s3');
    component.onDeleteSelected();

    expect(component.confirmConfig.title).toBe('Delete 2 subjects?');

    component.onConfirmed();

    expect(api.bulkDelete).toHaveBeenCalledTimes(1);
    expect(api.bulkDelete).toHaveBeenCalledWith('a1', ['s1', 's3'], true);
    // Deleted ids leave the selection, so Delete Selected cannot re-fire on them.
    expect(component.selectedCount).toBe(0);
  });

  it('deletes nothing when the confirmation is cancelled', () => {
    component.onDeleteSubject(RESPONSE.rows[0]);
    component.onConfirmCancelled();

    expect(component.confirmOpen).toBe(false);
    expect(api.bulkDelete).not.toHaveBeenCalled();
  });

  // --- rendered DOM -------------------------------------------------------------------

  it('renders the reference`s single toolbar row — no filter row on this page', () => {
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector('.sw-toolbar .toolbar-row1')).toBeTruthy();
    expect(host.querySelector('.sw-toolbar .toolbar-row2')).toBeFalsy();
  });

  it('renders a real table with the reference`s five columns plus the checkbox', () => {
    const host: HTMLElement = fixture.nativeElement;
    const headers = Array.from(host.querySelectorAll('table thead th')).map((th) => th.textContent!.trim());

    expect(headers).toEqual(['', 'Name', 'Type', 'Status', 'Action']);
    expect(host.querySelectorAll('table tbody tr').length).toBe(3);
  });

  it('colours the Type and Status tags by value', () => {
    const host: HTMLElement = fixture.nativeElement;
    const rows = host.querySelectorAll('table tbody tr');

    expect(rows[0].querySelector('.type-tag')!.classList).toContain('tag-brand');
    expect(rows[1].querySelector('.type-tag')!.classList).toContain('tag-warning');
    expect(rows[0].querySelector('.status-tag')!.classList).toContain('tag-success');
    expect(rows[2].querySelector('.status-tag')!.classList).toContain('tag-muted');
  });

  it('uses Bootstrap Icons only, and no native select', () => {
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelectorAll('i.bi').length).toBeGreaterThan(0);
    expect(host.querySelectorAll('[class*="ti-"]').length).toBe(0);
    expect(host.querySelectorAll('select').length).toBe(0);
    expect(host.querySelectorAll('svg').length).toBe(0);
  });

  it('renders the side column`s stats and tips cards', () => {
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelectorAll('.col-side .stat-row').length).toBe(4);
    expect(host.querySelectorAll('.col-side .status-card .tip-item').length).toBe(3);
  });
});
