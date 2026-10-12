import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { JobStatusService } from 'src/app/shared/services/jobs/job-status.service';
import { FeeReminderService } from 'src/app/shared/services/fees/fee-reminder.service';
import { ReminderFilterRow, ReminderRecipient } from 'src/app/shared/models/fees/fees.model';
import { FeeReminderComponent } from './fee-reminder.component';

const filter: ReminderFilterRow = {
  _id: 'f1', classId: 'c8', className: '8th', paidBelowPercent: 50, noPaymentSinceDays: 30, gapSinceLastReminderDays: 7
};
const recipient = (id: string, overrides: Partial<ReminderRecipient> = {}): ReminderRecipient => ({
  studentId: id, name: 'Student ' + id, admissionNo: null, mobile: '9876543210', paidPercent: 10, due: 37800, total: 42000, ...overrides
});

describe('FeeReminderComponent', () => {
  let fixture: ComponentFixture<FeeReminderComponent>;
  let component: FeeReminderComponent;
  let api: jasmine.SpyObj<FeeReminderService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<FeeReminderService>('FeeReminderService', ['list', 'create', 'remove', 'previewSaved', 'preview', 'sendSaved', 'send']);
    api.list.and.returnValue(of({ rows: [filter], summary: { savedFilters: 1, sentThisMonth: 0 }, canEdit: true }));
    await TestBed.configureTestingModule({
      declarations: [FeeReminderComponent],
      providers: [
        { provide: FeeReminderService, useValue: api },
        { provide: StudentOptionsService, useValue: { getFilterOptions: () => of({ classes: [], groups: [] }) } },
        { provide: JobStatusService, useValue: { watch: () => of({ state: 'completed', result: { sent: 1, warnings: [] } }) } },
        { provide: ShellContextService, useValue: { context: of({ activeSession: '2026-2027' }) } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(FeeReminderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('"To Send" re-runs the filter on the server on EVERY open — never reuses an earlier list', () => {
    api.previewSaved.and.returnValues(
      of({ rows: [recipient('1'), recipient('2')] }),
      of({ rows: [recipient('2')] })              // student 1 paid in between
    );
    component.openSaved(filter);
    expect(component.recipients.map((r) => r.studentId)).toEqual(['1', '2']);
    component.closeReview();

    component.openSaved(filter);
    expect(api.previewSaved).toHaveBeenCalledTimes(2);
    expect(component.recipients.map((r) => r.studentId)).toEqual(['2']);
  });

  it('sends exactly the checked students — unchecked and unreachable ones stay out', () => {
    api.previewSaved.and.returnValue(of({ rows: [recipient('1'), recipient('2'), recipient('3', { mobile: null })] }));
    api.sendSaved.and.returnValue(of({ message: 'queued', jobId: 'j1', queued: 1 }));
    component.openSaved(filter);
    expect(component.checked.has('3')).toBeFalse();
    component.toggleRecipient(component.recipients[1], false);
    component.sendNow();
    expect(api.sendSaved).toHaveBeenCalledTimes(1);
    expect(api.sendSaved.calls.mostRecent().args[3]).toEqual(['1']);
  });
});
