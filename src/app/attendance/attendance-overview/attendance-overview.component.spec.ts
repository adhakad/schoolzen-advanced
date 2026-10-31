import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, NEVER, of, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { AttendanceSocketService } from 'src/app/services/attendance-socket.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { AttendanceOverviewService } from 'src/app/shared/services/attendance/attendance-overview.service';
import { DepartmentsService } from 'src/app/shared/services/staff/departments.service';
import { DesignationsService } from 'src/app/shared/services/staff/designations.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { AttendanceOverviewComponent } from './attendance-overview.component';

describe('AttendanceOverviewComponent', () => {
  let fixture: ComponentFixture<AttendanceOverviewComponent>;
  let component: AttendanceOverviewComponent;
  let api: jasmine.SpyObj<AttendanceOverviewService>;

  const classes = [
    { _id: 'c6', class: 6, label: '6th', hasStreams: false, sections: [{ _id: 's6a', name: 'A' }], streams: [] },
    {
      _id: 'c11', class: 11, label: '11th', hasStreams: true, sections: [],
      streams: [{ _id: 'sci', name: 'science', sections: [{ _id: 'sciA', name: 'A' }, { _id: 'sciB', name: 'B' }] }]
    }
  ];

  beforeEach(async () => {
    api = jasmine.createSpyObj<AttendanceOverviewService>('AttendanceOverviewService', ['getGrid', 'getLiveStatus', 'getRecentArrivals', 'syncNow', 'getSyncStatus', 'mark']);
    api.getGrid.and.returnValue(of({
      month: '2026-08', personType: 'staff', today: '2026-08-10', truncated: false, canMark: true,
      days: [
        { dateKey: '2026-08-09', day: 9, dow: 'Sun', isToday: false, isFuture: false },
        { dateKey: '2026-08-10', day: 10, dow: 'Mon', isToday: true, isFuture: false },
        { dateKey: '2026-08-11', day: 11, dow: 'Tue', isToday: false, isFuture: true }
      ],
      rows: [
        {
          _id: 'p1', name: 'Priya', idLine: 'EMP ID STF-1', sub: 'Morning', code: 'STF-1', shift: 'Morning', type: 'staff', live: false, presentCount: 1,
          mark: { from: '7:45 AM', to: '2:00 PM', open: true },
          cells: { '2026-08-09': { s: 'P', t: '8:23 AM' }, '2026-08-10': { s: 'A', t: null }, '2026-08-11': { s: 'M', f: 1 } }
        },
        {
          _id: 'p2', name: 'Rahul', idLine: 'EMP ID STF-2', sub: 'Morning', code: 'STF-2', shift: 'Morning', type: 'staff', live: false, presentCount: 0,
          mark: { from: '7:45 AM', to: '2:00 PM', open: true },
          cells: { '2026-08-09': { s: '—', n: 1 }, '2026-08-10': { s: 'P', t: '8:01 AM', src: 'device', p: '8:01 AM' }, '2026-08-11': { s: 'WO', f: 1 } }
        }
      ]
    }));
    api.getSyncStatus.and.returnValue(of({ dateKey: '2026-08-10', lastSyncAt: '9:05 AM', lastSyncDate: '2026-08-10', lastFetched: 4, lastInserted: 4, lastUnmatched: 0, punchesToday: 42 }));
    api.mark.and.returnValue(of({ message: 'Priya marked Present.', cell: { s: 'P', t: '9:12 AM', src: 'manual' }, markedAt: '9:12 AM' }));
    api.getLiveStatus.and.returnValue(NEVER);
    api.getRecentArrivals.and.returnValue(NEVER);
    api.syncNow.and.returnValue(of({ message: 'queued', jobId: 'j', dateKey: '2026-08-10' }));

    await TestBed.configureTestingModule({
      declarations: [AttendanceOverviewComponent],
      providers: [
        { provide: AttendanceOverviewService, useValue: api },
        { provide: DepartmentsService, useValue: { getOptions: () => of({ rows: [{ _id: 'd1', name: 'Teaching', status: 'active' }] }) } },
        { provide: DesignationsService, useValue: { getOptions: () => of({ rows: [{ _id: 'g1', title: 'PRT', departmentId: 'd1' }] }) } },
        { provide: StudentOptionsService, useValue: { getFilterOptions: () => of({ classes, groups: [
          { _id: 'gen6', name: 'General', classId: 'c6', streamId: null, isSystemGroup: true },
          { _id: 'pcm', name: 'PCM', classId: 'c11', streamId: 'sci' },
          { _id: 'pcb', name: 'PCB', classId: 'c11', streamId: 'sci' }
        ] }) } },
        { provide: AttendanceSocketService, useValue: { onEvent: () => NEVER } },
        { provide: ShellContextService, useValue: { context: new BehaviorSubject({ activeSession: '2026-2027' }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(AttendanceOverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => component.closeMark());

  it('Sync now opens a confirm and never fires on the click itself', () => {
    component.onSyncClick();
    expect(component.syncConfirmOpen).toBeTrue();
    expect(api.syncNow).not.toHaveBeenCalled();
    component.onSyncConfirmed();
    expect(api.syncNow).toHaveBeenCalledWith('a1');
    expect(component.syncConfirmOpen).toBeFalse();
  });

  it('shows the "Last sync" line near Sync now', () => {
    expect(component.syncLine).toBe('Last sync: 9:05 AM / 42 punches today');
  });

  it('past / today / future / no-roster cells get the §3c treatment', () => {
    const [priya, rahul] = component.rows;
    const [past, today, future] = component.days;
    expect(component.cellClass(priya.cells['2026-08-09'], past, priya)).toBe('present locked-past');
    expect(component.cellTitle(priya, priya.cells['2026-08-09'], past)).toBe("Past dates can't be changed");
    expect(component.cellClass(priya.cells['2026-08-10'], today, priya)).toBe('absent live-click');
    expect(component.cellClass(priya.cells['2026-08-11'], future, priya)).toBe('future');
    expect(component.cellTitle(priya, priya.cells['2026-08-11'], future)).toBe('Upcoming date (from roster)');
    expect(component.cellTitle(priya, { s: 'H', f: 1 }, future)).toBe('Upcoming date');
    expect(component.cellClass(rahul.cells['2026-08-09'], past, rahul)).toBe('nocell');
  });

  it('marking: a chosen status saves at once and updates only that cell', () => {
    const [priya] = component.rows;
    const today = component.days[1];
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    component.openMark({ stopPropagation: () => undefined, currentTarget: anchor } as unknown as Event, priya, today);
    expect(component.markTarget?.device).toBeFalse();
    component.chooseMark('Present');
    expect(api.mark).toHaveBeenCalledWith('a1', { personType: 'staff', personId: 'p1', status: 'Present' }, jasmine.any(String));
    expect(component.rows[0].cells['2026-08-10']).toEqual({ s: 'P', t: '9:12 AM', src: 'manual' });
    expect(component.markTarget).toBeNull();
    expect(api.getGrid).toHaveBeenCalledTimes(1);
    anchor.remove();
  });

  it('a device punch opens read-only — nothing can be saved', () => {
    const rahul = component.rows[1];
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    component.openMark({ stopPropagation: () => undefined, currentTarget: anchor } as unknown as Event, rahul, component.days[1]);
    expect(component.markTarget?.device).toBeTrue();
    component.chooseMark('Absent');
    expect(api.mark).not.toHaveBeenCalled();
    anchor.remove();
  });

  it('without the attendance-mark permission or outside the window, today is not markable', () => {
    const [priya] = component.rows;
    component.canMark = false;
    expect(component.canOpenMark(priya, priya.cells['2026-08-10'], component.days[1])).toBeFalse();
    component.canMark = true;
    priya.mark = { from: '7:45 AM', to: '2:00 PM', open: false };
    expect(component.canOpenMark(priya, priya.cells['2026-08-10'], component.days[1])).toBeFalse();
    expect(component.cellTitle(priya, priya.cells['2026-08-10'], component.days[1])).toBe('Attendance window is closed (7:45 AM - 2:00 PM)');
    expect(component.cellClass(priya.cells['2026-08-10'], component.days[1], priya)).toBe('absent live-click closed');
  });

  // The cascade itself (options, disabled pills, resets) is covered by
  // person-filter.component.spec.ts; here: the page applies each change from the shared row.
  it('applies the shared filter row: staff filters and a Person Type switch that resets them', () => {
    component.onPersonFilterChange({ ...component.filterValue, departmentId: 'd1' });
    expect(api.getGrid).toHaveBeenCalledWith('a1', jasmine.objectContaining({ departmentId: 'd1' }));

    component.onPersonTypeChange('student');
    expect(component.departmentId).toBe('');
    expect(component.filterValue).toEqual(jasmine.objectContaining({ personType: 'student', departmentId: '' }));

    component.onPersonFilterChange({ ...component.filterValue, classId: 'c11', streamId: 'sci', groupId: 'pcm' });
    expect(api.getGrid).toHaveBeenCalledWith('a1', jasmine.objectContaining({ classId: 'c11', groupId: 'pcm' }));
  });

  it('keeps every filter visible: Person Type is not opted into hiding on Overview', () => {
    const filter = fixture.nativeElement.querySelector('app-person-filter');
    expect(filter).not.toBeNull();
    expect(filter.getAttribute('ng-reflect-hide-by-person-type')).toBeNull();
  });

  // --- attendance-fix2.md Part D ---------------------------------------------------------

  it('class-first: Student with no class sends no grid request and shows the empty state', () => {
    api.getGrid.calls.reset();
    component.onPersonTypeChange('student');
    expect(api.getGrid).not.toHaveBeenCalled();
    expect(component.needsClass).toBeTrue();
    expect(component.rows.length).toBe(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.needs-class').textContent).toContain('Select a class to see students and mark attendance');
    component.onPersonFilterChange({ ...component.filterValue, classId: 'c6' });
    expect(component.needsClass).toBeFalse();
    expect(api.getGrid).toHaveBeenCalledWith('a1', jasmine.objectContaining({ personType: 'student', classId: 'c6', session: '2026-2027' }));
  });

  it('class-first: a student chip is locked with "Select a class first" when the class is missing', () => {
    const student = { ...component.rows[0], type: 'student' as const };
    const today = component.days[1];
    expect(component.canOpenMark(student, student.cells['2026-08-10'], today)).toBeFalse();
    expect(component.cellTitle(student, student.cells['2026-08-10'], today)).toBe('Select a class first');
    component.classId = 'c6';
    expect(component.canOpenMark(student, student.cells['2026-08-10'], today)).toBeTrue();
  });

  it('a student mark carries the session + class/section context', () => {
    component.classId = 'c6';
    component.sectionId = 's6a';
    const student = { ...component.rows[0], type: 'student' as const };
    component.rows = [student];
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    component.openMark({ stopPropagation: () => undefined, currentTarget: anchor } as unknown as Event, student, component.days[1]);
    component.chooseMark('Present');
    expect(api.mark).toHaveBeenCalledWith('a1', jasmine.objectContaining({
      personType: 'student', personId: 'p1', status: 'Present', session: '2026-2027', classId: 'c6', sectionId: 's6a'
    }), jasmine.any(String));
    anchor.remove();
  });

  it('a refused mark puts the cell back, shows the message and a Retry that resends', () => {
    api.mark.and.returnValue(throwError(() => ({ category: 'PermissionError', message: 'Attendance can only be marked today between 7:45 AM and 2:00 PM.' })));
    const [priya] = component.rows;
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    component.openMark({ stopPropagation: () => undefined, currentTarget: anchor } as unknown as Event, priya, component.days[1]);
    component.chooseMark('Present');
    expect(component.rows[0].cells['2026-08-10']).toEqual({ s: 'A', t: null });
    expect(component.markError).toContain('7:45 AM');
    expect(component.failedMark).toBe('Present');
    api.mark.and.returnValue(of({ message: 'ok', cell: { s: 'P', t: '9:12 AM', src: 'manual' }, markedAt: '9:12 AM' }));
    component.retryMark();
    expect(api.mark).toHaveBeenCalledTimes(2);
    expect(component.rows[0].cells['2026-08-10']).toEqual({ s: 'P', t: '9:12 AM', src: 'manual' });
    anchor.remove();
  });

  it('a failed Sync shows the server message with a Retry, never raw JSON', () => {
    api.syncNow.and.returnValue(throwError(() => ({ category: 'ExternalServiceError', message: "The attendance sync service isn't running." })));
    component.onSyncConfirmed();
    expect(component.syncError).toBe("The attendance sync service isn't running.");
    fixture.detectChanges();
    const alert: HTMLElement = fixture.nativeElement.querySelector('.fetch-error');
    expect(alert.textContent).toContain("isn't running");
    expect(alert.textContent).not.toContain('{');
    expect(alert.querySelector('button')?.textContent).toContain('Retry');
  });
});
