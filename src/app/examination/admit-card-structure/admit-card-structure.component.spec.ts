import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { JobStatusService } from 'src/app/shared/services/jobs/job-status.service';
import { AdmitCardStructureService } from 'src/app/shared/services/examination/admit-card-structure.service';
import { AdmitStructureList } from 'src/app/shared/models/examination/examination.model';
import { StudentFilterOptions } from 'src/app/shared/models/student/student.model';
import { AdmitCardStructureComponent, time12 } from './admit-card-structure.component';

const list = (canEdit: boolean): AdmitStructureList => ({
  rows: [{
    _id: 'x1', examName: 'Half-Yearly Exam', subjectCount: 5, classId: 'c8', className: '8th', streamName: null, groupName: null,
    sectionName: null, generation: { state: 'ready', total: 40, generated: 40, failed: 0, message: null }
  }],
  total: 1, page: 1, pageSize: 25, summary: { classesTotal: 10, examsConfigured: 1 }, canEdit
});

const filterOptions: StudentFilterOptions = {
  classes: [{ _id: 'c8', class: 8, label: '8th', hasStreams: false, sections: [{ _id: 'sa', name: 'A' }], streams: [] }],
  groups: []
};

describe('AdmitCardStructureComponent', () => {
  let fixture: ComponentFixture<AdmitCardStructureComponent>;
  let component: AdmitCardStructureComponent;
  let api: jasmine.SpyObj<AdmitCardStructureService>;

  const create = async (canEdit: boolean) => {
    api = jasmine.createSpyObj('AdmitCardStructureService', ['list', 'options', 'get', 'create', 'update', 'remove']);
    api.list.and.returnValue(of(list(canEdit)));
    api.options.and.returnValue(of({
      subjects: [{ subjectId: 'a', name: 'English' }, { subjectId: 'b', name: 'Maths' }], examNames: ['Half-Yearly Exam', 'Final Exam'], groups: []
    }));
    api.create.and.returnValue(of({ message: 'ok', _id: 'x2', jobId: '', students: 40 }));
    await TestBed.configureTestingModule({
      declarations: [AdmitCardStructureComponent],
      providers: [
        { provide: AdmitCardStructureService, useValue: api },
        { provide: StudentOptionsService, useValue: { getFilterOptions: () => of(filterOptions) } },
        { provide: JobStatusService, useValue: { watch: () => of() } },
        { provide: ShellContextService, useValue: { context: of({ activeSession: '2026-2027' }) } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(AdmitCardStructureComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('lists created structures with the reference cells', async () => {
    await create(true);
    const row = fixture.nativeElement.querySelector('tbody tr');
    expect(row.textContent).toContain('Half-Yearly Exam');
    expect(row.textContent).toContain('5 subjects scheduled');
    expect(row.textContent).toContain('N/A');
    expect(row.textContent).toContain('All sections');
  });

  it('Create is hidden without the admit-card-structure grant', async () => {
    await create(false);
    expect(fixture.nativeElement.querySelector('.btn-primary')).toBeNull();
    expect(fixture.nativeElement.querySelector('.bi-trash')).toBeNull();
  });

  it('Submit stays disabled until a Class and an Exam Name are chosen; subjects load with the class', async () => {
    await create(true);
    component.openCreate();
    expect(component.canSubmit).toBeFalse();
    component.onFormClass('c8');
    expect(component.slots.map((s) => s.subjectId)).toEqual(['a', 'b']);
    expect(component.canSubmit).toBeFalse();
    component.form.examName = 'Half-Yearly Exam';
    expect(component.canSubmit).toBeTrue();
  });

  it('flags an unscheduled subject and a same-slot clash before calling the API', async () => {
    await create(true);
    component.openCreate();
    component.onFormClass('c8');
    component.form.examName = 'Half-Yearly Exam';
    component.submit();
    expect(api.create).not.toHaveBeenCalled();
    expect(Object.keys(component.slotErrors)).toEqual(['a', 'b']);

    component.slots[0] = { ...component.slots[0], examDate: '2026-10-10', startTime: '09:00', endTime: '11:00' };
    component.slots[1] = { ...component.slots[1], examDate: '2026-10-10', startTime: '10:00', endTime: '12:00' };
    component.submit();
    expect(api.create).not.toHaveBeenCalled();
    expect(component.slotErrors['b']).toContain('same time');

    component.slots[1] = { ...component.slots[1], startTime: '11:00', endTime: '13:00' };
    component.submit();
    expect(api.create).toHaveBeenCalled();
  });

  it('shows times the way the reference does', () => {
    expect(time12('09:00')).toBe('09:00 AM');
    expect(time12('14:30')).toBe('02:30 PM');
  });
});
