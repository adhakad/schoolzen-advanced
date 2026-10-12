import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { GenerateMarksheetService } from 'src/app/shared/services/examination/generate-marksheet.service';
import { MarksForm, MarksheetListResponse, MarksheetRow } from 'src/app/shared/models/examination/examination.model';
import { GenerateMarksheetComponent } from './generate-marksheet.component';

const row = (id: string, classId: string, status: MarksheetRow['status']): MarksheetRow => ({
  studentId: id, name: 'Student ' + id, initials: 'S', rollNumber: 7, classId, streamId: null, className: '8th', streamName: null, status
});

const listResponse: MarksheetListResponse = {
  rows: [row('s1', 'c8', 'entered'), row('s2', 'c8', 'pending'), row('s3', 'c9', 'pending'), row('s4', 'c10', 'nostructure')],
  nextCursor: null, total: 4, summary: { entered: 1, pending: 2, missing: 1 }, terms: ['Half-Yearly'], term: 'Half-Yearly', canEdit: true
};

const form: MarksForm = {
  studentId: 's2', name: 'Student s2', term: 'Half-Yearly', terms: ['Half-Yearly'],
  subjects: [
    { subjectId: 'a', name: 'English', theoryMax: 80, practicalMax: null },
    { subjectId: 'b', name: 'Science', theoryMax: 80, practicalMax: 20 }
  ],
  coScholasticAreas: ['Work Education'], gradeRows: [['A+', 91, 100]], passPercent: 33, result: null, canEdit: true
};

describe('GenerateMarksheetComponent', () => {
  let fixture: ComponentFixture<GenerateMarksheetComponent>;
  let component: GenerateMarksheetComponent;
  let api: jasmine.SpyObj<GenerateMarksheetService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj('GenerateMarksheetService', ['list', 'form', 'save', 'bulkForm', 'bulkSave', 'print']);
    api.list.and.returnValue(of(listResponse));
    api.form.and.returnValue(of(form));
    await TestBed.configureTestingModule({
      declarations: [GenerateMarksheetComponent],
      providers: [
        { provide: GenerateMarksheetService, useValue: api },
        { provide: StudentOptionsService, useValue: { getFilterOptions: () => of({ classes: [], groups: [] }) } },
        { provide: ShellContextService, useValue: { context: of({ activeSession: '2026-2027' }) } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(GenerateMarksheetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('a class with no structure can not be selected, and its actions are disabled', () => {
    const last = fixture.nativeElement.querySelectorAll('tbody tr')[3];
    expect(last.textContent).toContain('No structure set');
    expect((last.querySelector('td.chk input') as HTMLInputElement).disabled).toBeTrue();
    expect(Array.from(last.querySelectorAll('.icon-btn')).every((b) => (b as HTMLButtonElement).disabled)).toBeTrue();
  });

  it('Bulk Enter is disabled until rows are checked, and when they span classes', () => {
    expect(component.bulkDisabled).toBeTrue();
    component.toggleRow(component.rows[0], true);
    component.toggleRow(component.rows[1], true);
    expect(component.bulkDisabled).toBeFalse();
    component.toggleRow(component.rows[2], true);
    expect(component.selectionSpansClasses).toBeTrue();
    expect(component.bulkDisabled).toBeTrue();
  });

  it('marks above the subject max are blocked inline (MARKS_EXCEED_MAX)', () => {
    component.openMarks(component.rows[1]);
    component.setScore('a', 'theory', '81');
    component.saveMarks();
    expect(api.save).not.toHaveBeenCalled();
    expect(component.markErrors['a.theory']).toContain('(80)');
  });

  it('live result follows the reference calculation', () => {
    component.openMarks(component.rows[1]);
    component.setScore('a', 'theory', '68');
    component.setScore('b', 'theory', '62');
    component.setScore('b', 'practical', '18');
    expect(component.liveResult).toEqual({ total: 148, max: 180, pct: 82.2, pass: true });
  });

  it('a result saved since the form loaded asks before overwriting (MARKS_ALREADY_ENTERED)', () => {
    api.save.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 409, error: { error: { category: 'ConflictError', code: 'MARKS_ALREADY_ENTERED', message: 'exists', requestId: 'r' } }
    })));
    component.openMarks(component.rows[1]);
    component.saveMarks();
    expect(component.overwriteOpen).toBeTrue();
    api.save.and.returnValue(of({ message: 'ok', result: null as any }));
    component.confirmOverwrite();
    expect(api.save.calls.mostRecent().args[3].overwrite).toBeTrue();
  });
});
