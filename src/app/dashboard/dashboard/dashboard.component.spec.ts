import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ChangeDetectorRef, NO_ERRORS_SCHEMA } from '@angular/core';
import { RouterTestingModule } from '@angular/router/testing';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { AttendanceSocketService } from 'src/app/services/attendance-socket.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { DashboardService } from 'src/app/shared/services/dashboard/dashboard.service';
import { ApprovalRequestsService } from 'src/app/shared/services/approvals/requests.service';
import { IconActionComponent } from 'src/app/shared/components/icon-action/icon-action.component';
import { ConfirmModalComponent } from 'src/app/shared/components/confirm-modal/confirm-modal.component';
import { DashboardResponse } from 'src/app/shared/models/dashboard/dashboard.model';
import { DashboardComponent, buildCalendar, shortRupees } from './dashboard.component';

const AT = '2026-09-06T04:11:00.000Z';
const bars = [
  { dateKey: '2026-08-31', label: 'Mon', pct: 88, reason: null, isToday: false },
  { dateKey: '2026-09-01', label: 'Tue', pct: 92, reason: null, isToday: false },
  { dateKey: '2026-09-02', label: 'Wed', pct: 80, reason: null, isToday: false },
  { dateKey: '2026-09-03', label: 'Thu', pct: 95, reason: null, isToday: false },
  { dateKey: '2026-09-04', label: 'Fri', pct: 90, reason: null, isToday: false },
  { dateKey: '2026-09-05', label: 'Sat', pct: null, reason: 'weekly-off', isToday: false },
  { dateKey: '2026-09-06', label: 'Today', pct: null, reason: 'not-marked', isToday: true }
] as any[];

const fullResponse = (): DashboardResponse => ({
  todayKey: '2026-09-06',
  widgets: {
    students: { total: 612, generatedAt: AT },
    staff: { total: 42, generatedAt: AT },
    attendance: { todayPct: null, todayReason: 'not-marked', bars, generatedAt: AT },
    fees: { collected: 1840000, due: 620000, collectedPct: 75, generatedAt: AT },
    calendar: { month: '2026-09', holidayDays: [15, 29], generatedAt: AT },
    approvals: {
      total: 3,
      rows: [
        { _id: 'r1', type: 'leave', typeLabel: 'Leave', name: 'Priya Sharma', days: 2, details: '', canAct: true },
        { _id: 'r2', type: 'leave', typeLabel: 'Leave', name: 'Rahul Verma', days: 1, details: '', canAct: false }
      ],
      generatedAt: AT
    },
    holidays: { rows: [{ _id: 'h1', name: 'Ganesh Chaturthi', startDate: '2026-09-15', endDate: '2026-09-15' }], generatedAt: AT },
    quickActions: {
      tiles: [
        { key: 'new-admission', allowed: true }, { key: 'collect-fee', allowed: false }, { key: 'apply-leave', allowed: true },
        { key: 'issue-tc', allowed: false }, { key: 'generate-marksheet', allowed: true }
      ],
      generatedAt: AT
    }
  }
});

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let component: DashboardComponent;
  let api: jasmine.SpyObj<DashboardService>;
  let approvalsApi: jasmine.SpyObj<ApprovalRequestsService>;
  let hints$: Subject<any>;
  let connected$: BehaviorSubject<boolean>;

  const render = () => {
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  };
  const el = (): HTMLElement => fixture.nativeElement;
  const card = (key: string) => el().querySelector(`[data-widget="${key}"]`) as HTMLElement | null;

  const setup = (response: DashboardResponse | Error = fullResponse()) => {
    api = jasmine.createSpyObj<DashboardService>('DashboardService', ['getDashboard', 'getWidget']);
    api.getDashboard.and.returnValue(response instanceof Error ? throwError(() => response) : of(response));
    approvalsApi = jasmine.createSpyObj<ApprovalRequestsService>('ApprovalRequestsService', ['decide']);
    approvalsApi.decide.and.returnValue(of({ message: 'Approved.', row: null }));
    hints$ = new Subject<any>();
    connected$ = new BehaviorSubject<boolean>(true);

    TestBed.configureTestingModule({
      imports: [RouterTestingModule, FormsModule],
      declarations: [DashboardComponent, IconActionComponent, ConfirmModalComponent],
      providers: [
        { provide: DashboardService, useValue: api },
        { provide: ApprovalRequestsService, useValue: approvalsApi },
        {
          provide: ShellContextService,
          useValue: { context: of({ activeSession: '2026-2027', displayName: 'Admin', school: { name: 'Green Valley Public School' }, v2Permissions: null }) }
        },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'adm' }) } },
        { provide: AttendanceSocketService, useValue: { onEvent: () => hints$.asObservable(), onConnected: () => connected$.asObservable() } },
        { provide: MatSnackBar, useValue: jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']) }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('renders the reference hero from server data and today (never hardcoded)', () => {
    setup();
    expect(el().querySelector('.hd-day')!.textContent!.trim()).toBe('06');
    expect(el().querySelector('.hd-mon')!.textContent!.trim()).toBe('Sep');
    expect(el().querySelector('.hero h1')!.textContent!.trim()).toBe('Welcome back, Admin');
    expect(el().querySelector('.hero p')!.textContent!.trim()).toBe('Sunday · Green Valley Public School · 2026-27 session');
    const stats = Array.from(el().querySelectorAll('.hero-stat')).map((s) => [
      s.querySelector('.hs-num')!.textContent!.trim(), s.querySelector('.hs-lbl')!.textContent!.trim()
    ]);
    // Today has no attendance yet → "—", never 0% / NaN%.
    expect(stats).toEqual([['612', 'Students'], ['42', 'Staff'], ['—', 'Attendance'], ['₹18.4L', 'Collected']]);
  });

  it('draws the week: weekday labels, "Today" last, a null day muted', () => {
    setup();
    const labels = Array.from(card('attendance')!.querySelectorAll('.bar-lbl')).map((b) => b.textContent!.trim());
    expect(labels).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today']);
    const barEls = card('attendance')!.querySelectorAll('.bar');
    expect((barEls[0] as HTMLElement).style.height).toBe('88%');
    expect(barEls[5].classList).toContain('muted');
    expect(card('attendance')!.querySelector('.sub')!.textContent).toContain('Whole school');
    expect(card('attendance')!.querySelector('.sub')!.textContent).toContain('as of');
  });

  it('fee donut and legend use the server numbers', () => {
    setup();
    expect(card('fees')!.querySelector('.donut-inner b')!.textContent!.trim()).toBe('75%');
    const legend = Array.from(card('fees')!.querySelectorAll('.donut-legend-row b')).map((b) => b.textContent!.trim());
    expect(legend).toEqual(['₹18.4L', '₹6.2L']);
    expect(card('fees')!.querySelector('.sub')!.textContent).toContain('2026-27 session, incl. arrears');
  });

  it('calendar highlights today and marks holiday days; arrows refetch only the calendar', () => {
    setup();
    const today = card('calendar')!.querySelector('.cal-day.today')!;
    expect(today.textContent!.trim()).toBe('6');
    const holidays = Array.from(card('calendar')!.querySelectorAll('.cal-day.holiday')).map((d) => d.textContent!.trim());
    expect(holidays).toEqual(['15', '29']);
    expect(card('calendar')!.querySelector('.cal-month')!.textContent!.trim()).toBe('Today: 6 Sep');
    expect(card('calendar')!.querySelectorAll('.bi-chevron-left, .bi-chevron-right').length).toBe(2);
    expect(card('calendar')!.querySelector('svg')).toBeNull();

    api.getWidget.and.returnValue(of({ todayKey: '2026-09-06', key: 'calendar', widget: { month: '2026-10', holidayDays: [2], generatedAt: AT } } as any));
    (card('calendar')!.querySelector('[aria-label="Next month"]') as HTMLElement).click();
    render();
    expect(api.getWidget).toHaveBeenCalledWith('adm', 'calendar', '2026-2027', '2026-10');
    expect(card('calendar')!.querySelector('.card-title-row')!.textContent!.trim()).toBe('October 2026');
    expect(card('calendar')!.querySelector('.cal-day.today')).toBeNull();
  });

  it('a widget the server omitted (no grant) is not rendered at all', () => {
    const res = fullResponse();
    delete res.widgets.fees;
    delete res.widgets.staff;
    setup(res);
    expect(card('fees')).toBeNull();
    const labels = Array.from(el().querySelectorAll('.hs-lbl')).map((l) => l.textContent!.trim());
    expect(labels).toEqual(['Students', 'Attendance']);
  });

  it('quick-action tiles: allowed ones link, the rest render locked with no link', () => {
    setup();
    const tile = (key: string) => el().querySelector(`[data-tile="${key}"]`) as HTMLElement;
    expect(tile('new-admission').tagName).toBe('A');
    expect(tile('new-admission').getAttribute('href')).toBe('/v2/student/admission');
    expect(tile('collect-fee').tagName).toBe('DIV');
    expect(tile('collect-fee').classList).toContain('locked');
    expect(tile('collect-fee').getAttribute('href')).toBeNull();
    expect(tile('collect-fee').querySelector('.bi-lock-fill')).not.toBeNull();
    expect(tile('issue-tc').querySelector('.bi-file-earmark-arrow-up')).not.toBeNull();
    expect(el().querySelectorAll('.ql-item svg').length).toBe(0);
  });

  it('one failed widget shows its own error + Retry while the rest render', () => {
    const res = fullResponse();
    (res.widgets as any).fees = { error: { code: 'DASHBOARD_LOAD_FAILED', message: "Couldn't load this — try refreshing." } };
    setup(res);
    expect(card('fees')!.querySelector('.widget-error')!.textContent).toContain("Couldn't load this");
    expect(card('attendance')!.querySelector('.bar-chart')).not.toBeNull();
    // The hero stat is "—", not a 0 that would look like real data.
    const collected = Array.from(el().querySelectorAll('.hero-stat')).find((s) => s.textContent!.includes('Collected'))!;
    expect(collected.querySelector('.hs-num')!.textContent!.trim()).toBe('—');

    api.getWidget.and.returnValue(of({ todayKey: '2026-09-06', key: 'fees', widget: { collected: 100, due: 0, collectedPct: 100, generatedAt: AT } } as any));
    (card('fees')!.querySelector('.retry-link') as HTMLElement).click();
    render();
    expect(api.getWidget).toHaveBeenCalledWith('adm', 'fees', '2026-2027', '');
    expect(card('fees')!.querySelector('.donut-inner b')!.textContent!.trim()).toBe('100%');
  });

  it('a whole-request failure turns every waiting card into its own Retry, not zeros', () => {
    setup(new Error('down'));
    expect(el().querySelectorAll('.widget-error').length).toBeGreaterThan(0);
    expect(Array.from(el().querySelectorAll('.hs-num')).every((n) => n.textContent!.trim() === '—')).toBeTrue();
  });

  it('Approve/Reject only on rows the viewer may act on, and only after the confirm', () => {
    setup();
    const rows = card('approvals')!.querySelectorAll('.arrival-row');
    expect(rows[0].querySelectorAll('app-icon-action').length).toBe(2);
    expect(rows[1].querySelectorAll('app-icon-action').length).toBe(0);
    expect(rows[0].querySelector('.arrival-sub')!.textContent!.trim()).toBe('Leave · 2 days');
    expect(card('approvals')!.querySelector('.sub')!.textContent).toContain('3 total');

    api.getWidget.and.returnValue(of({ todayKey: '2026-09-06', key: 'approvals', widget: { total: 2, rows: [], generatedAt: AT } } as any));
    (rows[0].querySelector('button[aria-label="Approve"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(approvalsApi.decide).not.toHaveBeenCalled();
    (el().querySelector('.confirm-delete') as HTMLElement).click();
    expect(approvalsApi.decide).toHaveBeenCalledWith('adm', 'leave', 'r1', 'approve', jasmine.any(String));
    expect(api.getWidget).toHaveBeenCalledWith('adm', 'approvals', '2026-2027', '');
  });

  it('a socket hint refetches only that live widget, debounced; others are ignored', fakeAsync(() => {
    setup();
    api.getWidget.and.returnValue(of({ todayKey: '2026-09-06', key: 'attendance', widget: fullResponse().widgets.attendance } as any));
    hints$.next({ widget: 'attendance' });
    hints$.next({ widget: 'attendance' });
    hints$.next({ widget: 'fees' });
    tick(1000);
    expect(api.getWidget).toHaveBeenCalledTimes(1);
    expect(api.getWidget).toHaveBeenCalledWith('adm', 'attendance', '2026-2027', '');
  }));

  it('polls only the live widgets while the socket is down', fakeAsync(() => {
    setup();
    api.getWidget.and.callFake((_a: string, key: any) => of({ todayKey: '2026-09-06', key, widget: (fullResponse().widgets as any)[key] } as any));
    connected$.next(false);
    tick(60000);
    const keys = api.getWidget.calls.allArgs().map((args) => args[1]).sort();
    expect(keys).toEqual(['approvals', 'attendance']);
    connected$.next(true);
    tick(120000);
    expect(api.getWidget).toHaveBeenCalledTimes(2);
  }));

  it('helpers: compact rupees, Sunday-first grid with muted neighbours', () => {
    expect(shortRupees(1840000)).toBe('₹18.4L');
    expect(shortRupees(12000000)).toBe('₹1.2Cr');
    expect(shortRupees(45000)).toBe('₹45,000');
    const cells = buildCalendar('2026-09', '2026-09-06', [15]);
    expect(cells.length % 7).toBe(0);
    expect(cells.slice(0, 2).map((c) => [c.day, c.muted])).toEqual([[30, true], [31, true]]);
    expect(cells.filter((c) => c.today).map((c) => c.day)).toEqual([6]);
    expect(cells.slice(-3).map((c) => c.day)).toEqual([1, 2, 3]);
  });
});
