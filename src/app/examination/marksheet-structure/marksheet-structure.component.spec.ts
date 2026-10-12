import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { MarksheetStructureService } from 'src/app/shared/services/examination/marksheet-structure.service';
import { MarksheetSetup, MarksheetStructureList } from 'src/app/shared/models/examination/examination.model';
import { MarksheetStructureComponent } from './marksheet-structure.component';

const list = (canEdit: boolean): MarksheetStructureList => ({
  rows: [
    { classId: 'c8', className: '8th', streamId: null, streamName: null, templateCode: 'T1', subjectsSet: 5, subjectsTotal: 5, setUp: true, version: 2 },
    { classId: 'c11', className: '11th', streamId: 's1', streamName: 'Science', templateCode: null, subjectsSet: 0, subjectsTotal: 0, setUp: false, version: 0 }
  ],
  summary: { classesTotal: 2, setUp: 1 },
  canEdit
});

const setup: MarksheetSetup = {
  classId: 'c8', streamId: null, label: '8th',
  template: { code: 'T1', terms: ['Half-Yearly'], gradeScale: 'A+ to F', theoryMax: 100, practicalMax: null },
  notConfigured: null,
  candidates: [{ subjectId: 'a', name: 'English' }, { subjectId: 'b', name: 'Science' }],
  subjectsMissing: null,
  subjects: [],
  version: 2,
  canEdit: true
};

describe('MarksheetStructureComponent', () => {
  let fixture: ComponentFixture<MarksheetStructureComponent>;
  let api: jasmine.SpyObj<MarksheetStructureService>;

  const create = async (canEdit: boolean) => {
    api = jasmine.createSpyObj('MarksheetStructureService', ['list', 'setup', 'save', 'remove']);
    api.list.and.returnValue(of(list(canEdit)));
    api.setup.and.returnValue(of(setup));
    api.save.and.returnValue(of({ message: 'saved', version: 3 }));
    await TestBed.configureTestingModule({
      declarations: [MarksheetStructureComponent],
      providers: [
        { provide: MarksheetStructureService, useValue: api },
        { provide: StudentOptionsService, useValue: { getFilterOptions: () => of({ classes: [], groups: [] }) } },
        { provide: ShellContextService, useValue: { context: of({ activeSession: '2026-2027' }) } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(MarksheetStructureComponent);
    fixture.detectChanges();
  };

  it('shows every class(+stream) — configured or not — with Not set / N/A cells', async () => {
    await create(true);
    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('5 of 5 subjects');
    expect(rows[0].textContent).toContain('N/A');
    expect(rows[1].textContent).toContain('Not set');
    expect(rows[1].querySelector('.bi-plus-lg')).not.toBeNull();
    expect(rows[0].querySelector('.bi-trash')).not.toBeNull();
  });

  it('without the marksheet-structure grant there is no set-up / remove action', async () => {
    await create(false);
    expect(fixture.nativeElement.querySelector('.bi-plus-lg')).toBeNull();
    expect(fixture.nativeElement.querySelector('.bi-trash')).toBeNull();
  });

  it('first set-up ticks every subject as theory; no hardcoded 100 ceiling on maxes', async () => {
    await create(true);
    const component = fixture.componentInstance;
    component.openSetup(component.rows[0]);
    expect(component.markRows.length).toBe(2);
    component.setMax('a', 'theory', '150');
    component.submit();
    expect(api.save).toHaveBeenCalled();
    const subjects = api.save.calls.mostRecent().args[5];
    expect(subjects[0]).toEqual({ subjectId: 'a', theoryMax: 150, practicalMax: null });
  });

  it('blocks a zero / blank max inline before calling the API (MARKS_MAX_INVALID)', async () => {
    await create(true);
    const component = fixture.componentInstance;
    component.openSetup(component.rows[0]);
    component.setMax('b', 'theory', '0');
    component.submit();
    expect(api.save).not.toHaveBeenCalled();
    expect(component.fieldErrors['b.theory']).toContain('valid maximum');
  });

  it('remove needs DELETE typed first', async () => {
    await create(true);
    const component = fixture.componentInstance;
    component.openRemove(component.rows[0]);
    component.confirmText = 'delete';
    expect(component.removeConfirmed).toBeTrue();
    component.confirmText = 'DEL';
    expect(component.removeConfirmed).toBeFalse();
  });
});
