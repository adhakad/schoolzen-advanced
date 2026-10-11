import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeDetectorRef, NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { HolidayAssignService } from 'src/app/shared/services/holiday/holiday-assign.service';
import { HolidayTemplatesService } from 'src/app/shared/services/holiday/holiday-templates.service';
import { HolidaysService } from 'src/app/shared/services/holiday/holidays.service';
import { LeaveFilterOptionsService } from 'src/app/shared/services/leave/leave-filter-options.service';
import { HolidayAssignGridResponse } from 'src/app/shared/models/holiday/holiday-assign.model';
import { EMPTY_FILTER_OPTIONS } from 'src/app/shared/models/leave/person-filter.model';
import { HolidayAssignComponent } from './assign.component';

const grid = (canAssign: boolean): HolidayAssignGridResponse => ({
  rows: [
    { _id: 'p1', name: 'Priya Sharma', code: 'STF-0142', department: 'Teaching', sub: 'Teacher', templateId: 't1', templateName: 'School 2026' },
    { _id: 'p2', name: 'Rahul Verma', code: 'STF-0087', department: 'Admin', sub: 'Clerk', templateId: null, templateName: null }
  ],
  total: 2, page: 1, limit: 25, truncated: false, canAssign,
  summary: { staff: { assigned: 1, total: 2 }, student: { assigned: 0, total: 0 } }
});

describe('HolidayAssignComponent', () => {
  let fixture: ComponentFixture<HolidayAssignComponent>;
  let component: HolidayAssignComponent;
  let api: jasmine.SpyObj<HolidayAssignService>;

  const setup = async (response: HolidayAssignGridResponse) => {
    api = jasmine.createSpyObj<HolidayAssignService>('HolidayAssignService', ['getGrid', 'assign', 'unassign']);
    api.getGrid.and.returnValue(of(response));
    api.assign.and.returnValue(of({ message: 'ok', count: 1 }));
    await TestBed.configureTestingModule({
      declarations: [HolidayAssignComponent],
      providers: [
        { provide: HolidayAssignService, useValue: api },
        { provide: HolidayTemplatesService, useValue: { getOptions: () => of({ rows: [{ _id: 't1', name: 'School 2026', holidayIds: ['h1'] }] }) } },
        { provide: HolidaysService, useValue: { getOptions: () => of({ rows: [{ _id: 'h1', name: 'Diwali', startDate: '2026-11-08', endDate: '2026-11-09', days: 2, source: 'manual' }] }) } },
        { provide: LeaveFilterOptionsService, useValue: { load: () => of({ options: EMPTY_FILTER_OPTIONS, complete: true }) } },
        { provide: ShellContextService, useValue: { context: of({ activeSession: '2026-2027' }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(HolidayAssignComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  const warning = (): HTMLElement | null => fixture.nativeElement.querySelector('.sel-warning');
  // OnPush: a direct method call doesn't mark the view dirty the way a real click does.
  const render = () => fixture.componentRef.injector.get(ChangeDetectorRef).detectChanges();

  it('a mixed selection shows the warning and disables both Assign and Edit', async () => {
    await setup(grid(true));
    component.toggleRow(component.rows[0]);
    component.toggleRow(component.rows[1]);
    render();
    expect(component.selection).toBe('mixed');
    expect(warning()).not.toBeNull();
    expect(component.assignDisabled).toBeTrue();
    expect(component.editDisabled).toBeTrue();
    component.onAssignSelected();
    component.onEditSelected();
    expect(component.modalOpen).toBeFalse();
  });

  it('only-unassigned enables Assign; only-assigned enables Edit; the mode is sent to the API', async () => {
    await setup(grid(true));
    component.toggleRow(component.rows[1]);
    render();
    expect(warning()).toBeNull();
    expect(component.assignDisabled).toBeFalse();
    expect(component.editDisabled).toBeTrue();
    component.onAssignSelected();
    component.onModalTemplateChange('t1');
    component.onModalSubmit();
    const body = api.assign.calls.mostRecent().args[0];
    expect(body.mode).toBe('assign');
    expect(body.personIds).toEqual(['p2']);

    component.toggleRow(component.rows[0]);
    expect(component.selection).toBe('edit');
    expect(component.editDisabled).toBeFalse();
  });

  it('editing a live assignment stays locked until the confirm box is ticked', async () => {
    await setup(grid(true));
    component.onRowAction(component.rows[0]);
    expect(component.mode).toBe('edit');
    expect(component.modalSubmitDisabled).toBeTrue();
    component.onRemoveTemplate();
    expect(api.unassign).not.toHaveBeenCalled();
    component.onEditConfirmChange(true);
    expect(component.modalSubmitDisabled).toBeFalse();
  });

  it('hides every assign control without the holiday-assign edit permission', async () => {
    await setup(grid(false));
    expect(fixture.nativeElement.querySelector('.btn-assign')).toBeNull();
    component.onRowAction(component.rows[1]);
    expect(component.modalOpen).toBeFalse();
  });
});
