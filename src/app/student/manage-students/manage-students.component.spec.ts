import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, Subject, throwError } from 'rxjs';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { ManageStudentsService } from 'src/app/shared/services/student/manage-students.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { JobStatusService } from 'src/app/shared/services/jobs/job-status.service';
import { StudentFilterOptions, StudentListRow } from 'src/app/shared/models/student/student.model';
import { ManageStudentsComponent } from './manage-students.component';

const OPTIONS: StudentFilterOptions = {
  classes: [
    { _id: 'c8', class: 8, label: '8th', hasStreams: false, sections: [{ _id: 's8a', name: 'A' }], streams: [] },
    { _id: 'c11', class: 11, label: '11th', hasStreams: true, sections: [], streams: [{ _id: 'sci', name: 'science', sections: [] }] }
  ],
  groups: []
};

const ROW: StudentListRow = {
  enrollmentId: 'e1', studentId: 'st1', name: 'Rohan Kapoor', admissionNo: 2024142, status: 'admitted',
  photoUrl: null, fatherName: 'Suresh', motherName: 'Sunita', contact: '9876543210', card: '•• 8821',
  rollNumber: 12, session: '2026-2027', classId: 'c8', streamId: null, groupId: null, sectionId: 's8a',
  className: '8th', streamName: null, sectionName: 'A', classTag: '8th · A', placementIncomplete: false
};

describe('ManageStudentsComponent', () => {
  let fixture: ComponentFixture<ManageStudentsComponent>;
  let component: ManageStudentsComponent;
  let api: jasmine.SpyObj<ManageStudentsService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<ManageStudentsService>('ManageStudentsService', [
      'getStudents', 'getOverview', 'getStudent', 'bulkDelete', 'assignCards', 'resyncCard', 'exportExcel', 'importExcel'
    ]);
    api.getStudents.and.returnValue(of({ rows: [ROW], nextCursor: null, total: 1 }));
    api.getOverview.and.returnValue(of({ totalStudents: 1, cardsAssigned: 1 }));
    api.bulkDelete.and.returnValue(of({ message: 'ok', deleted: 1, rows: [] }));

    await TestBed.configureTestingModule({
      declarations: [ManageStudentsComponent],
      providers: [
        { provide: ManageStudentsService, useValue: api },
        { provide: StudentOptionsService, useValue: { getFilterOptions: () => of(OPTIONS), getFieldConfig: () => of({ fields: [], options: {} }) } },
        { provide: JobStatusService, useValue: { watch: () => of() } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } },
        { provide: ShellContextService, useValue: { context: of({ activeSession: '2026-2027' }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(ManageStudentsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows every student by default — no filter gates the list', () => {
    expect(api.getStudents).toHaveBeenCalledWith('a1', jasmine.objectContaining({
      session: '2026-2027', classId: '', streamId: '', groupId: '', sectionId: '', cursor: null
    }));
    expect(component.rows.length).toBe(1);
  });

  it('keeps the Excel button disabled until a Class is picked', () => {
    const button = (): HTMLButtonElement => fixture.nativeElement.querySelector('.excel-btn');
    expect(component.excelEnabled).toBe(false);
    expect(button().disabled).toBe(true);

    component.onFilterChange({ classId: 'c8', streamId: '', groupId: '', sectionId: '' });
    fixture.detectChanges();
    expect(component.excelEnabled).toBe(true);
    expect(button().disabled).toBe(false);
  });

  it('also needs the Stream before Excel opens for a streamed class', () => {
    component.onFilterChange({ classId: 'c11', streamId: '', groupId: '', sectionId: '' });
    expect(component.excelEnabled).toBe(false);
    component.onFilterChange({ classId: 'c11', streamId: 'sci', groupId: '', sectionId: '' });
    expect(component.excelEnabled).toBe(true);
  });

  it('narrows the list with the cascade filter and restarts at the first keyset page', () => {
    api.getStudents.calls.reset();
    component.onFilterChange({ classId: 'c8', streamId: '', groupId: '', sectionId: 's8a' });
    expect(component.page).toBe(1);
    expect(api.getStudents).toHaveBeenCalledWith('a1', jasmine.objectContaining({ classId: 'c8', sectionId: 's8a', cursor: null }));
  });

  it('never deletes on a click — it opens the type-DELETE confirmation first', () => {
    component.onDelete(ROW);
    expect(api.bulkDelete).not.toHaveBeenCalled();
    expect(component.confirmOpen).toBe(true);
    expect(component.confirmConfig.typeToConfirm).toBe('DELETE');

    component.onConfirmed();
    // With an Idempotency-Key — the backend guard behind the client-side one.
    expect(api.bulkDelete).toHaveBeenCalledWith('a1', ['st1'], jasmine.any(String));
  });

  it('confirms before a resync reaches the devices', () => {
    api.resyncCard.and.returnValue(of({ message: 'ok', jobId: 'j1' }));
    component.onResync(ROW);
    expect(api.resyncCard).not.toHaveBeenCalled();
    component.onConfirmed();
    expect(api.resyncCard).toHaveBeenCalledWith('a1', 'st1');
  });

  it('keys the per-row busy state by row — one row resyncing never blocks another', () => {
    const pending = new Subject<{ message: string; jobId: string }>();
    api.resyncCard.and.returnValue(pending.asObservable());
    component.onResync(ROW);
    component.onConfirmed();
    expect(component.isBusy(ROW)).toBe(true);
    expect(component.isBusy({ ...ROW, studentId: 'st2' })).toBe(false);
    pending.next({ message: 'ok', jobId: 'j1' });
    expect(component.isBusy(ROW)).toBe(false);
  });

  it('shows a per-row outcome when part of a bulk delete fails, not one toast', () => {
    api.bulkDelete.and.returnValue(of({
      message: '1 student processed', deleted: 1,
      rows: [{ id: 'st9', code: 'STUDENT_NOT_FOUND', message: 'Student not found' }]
    }));
    component.selected.set('st1', ROW);
    component.selected.set('st9', { ...ROW, studentId: 'st9', name: 'Gone Student' });
    component.onDeleteSelected();
    component.onConfirmed();
    expect(component.bulkResultOpen).toBe(true);
    expect(component.bulkResultLines).toEqual([{ label: 'Gone Student', message: 'Student not found' }]);
  });

  it('ignores a second delete while one is in flight (double-submit guard)', () => {
    const pending = new Subject<never>();
    api.bulkDelete.and.returnValue(pending.asObservable());
    component.onDelete(ROW);
    component.onConfirmed();
    component.onDelete({ ...ROW, studentId: 'st2' });
    component.onConfirmed();
    expect(api.bulkDelete).toHaveBeenCalledTimes(1);
  });

  it('rejects the same card typed for two students before submit', () => {
    const second = { ...ROW, studentId: 'st2', name: 'Priya Joshi' };
    component.selected.set('st1', ROW);
    component.selected.set('st2', second);
    component.onAssignCardSelected();
    component.onCardInput('st1', '1234');
    component.onCardInput('st2', '1234');
    expect(component.cardRowError('st2')).toContain('Rohan Kapoor');
    expect(component.cardSubmitDisabled).toBe(true);
    component.onCardSubmit();
    expect(api.assignCards).not.toHaveBeenCalled();
  });

  it('tells a failed list load apart from an empty one', () => {
    api.getStudents.and.returnValue(throwError(() => new Error('down')));
    component.retryList();
    fixture.detectChanges();
    expect(component.loadError).toContain("Couldn't load");
    expect(fixture.nativeElement.querySelector('.load-error')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('No students in this session yet');
  });
});
