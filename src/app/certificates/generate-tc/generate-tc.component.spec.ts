import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeDetectorRef, NO_ERRORS_SCHEMA } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { TransferCertificateService } from 'src/app/shared/services/certificates/transfer-certificate.service';
import {
  TcIssueDraft, TcIssueResponse, TcListResponse, TcStudentRow
} from 'src/app/shared/models/certificates/certificates.model';
import { GenerateTcComponent } from './generate-tc.component';

const row = (overrides: Partial<TcStudentRow> = {}): TcStudentRow => ({
  _id: 'e1', studentId: 's1', rollNumber: 12, name: 'Rohan Kapoor', initials: 'RK', admissionNo: 2024142,
  className: '8th', status: 'notissued', tcId: null, dateOfLeaving: null, ...overrides
});
const draft: TcIssueDraft = {
  studentId: 's1', name: 'Rohan Kapoor', serialNumber: 'TC-2026-0048', className: '8th', nextClassName: '9th',
  workingDays: 210, presentDays: 193, totalDue: 0, canOverrideFees: false, alreadyIssued: false
};
const feesError = (overridable: boolean) => ({
  error: { error: {
    category: 'ConflictError', code: 'TC_FEES_PENDING', message: 'This student still has ₹5,000 in pending fees.',
    fields: [{ field: 'fees', message: '5000', code: overridable ? 'TC_FEES_PENDING_OVERRIDABLE' : 'TC_FEES_PENDING' }]
  } }
});

describe('GenerateTcComponent', () => {
  let fixture: ComponentFixture<GenerateTcComponent>;
  let component: GenerateTcComponent;
  let api: jasmine.SpyObj<TransferCertificateService>;

  const render = () => fixture.debugElement.injector.get(ChangeDetectorRef).detectChanges();

  const setup = async (response: Partial<TcListResponse>) => {
    api = jasmine.createSpyObj<TransferCertificateService>('TransferCertificateService', ['list', 'draft', 'issue', 'get']);
    api.list.and.returnValue(of({ rows: [], nextCursor: null, total: 0, summary: null, canIssue: true, ...response } as TcListResponse));
    api.draft.and.returnValue(of(draft));
    await TestBed.configureTestingModule({
      declarations: [GenerateTcComponent],
      providers: [
        { provide: TransferCertificateService, useValue: api },
        { provide: StudentOptionsService, useValue: { getFilterOptions: () => of({ classes: [], groups: [] }) } },
        { provide: ShellContextService, useValue: { context: of({ activeSession: '2026-2027' }) } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(GenerateTcComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('shows Issue TC on not-issued rows and a printer icon on issued rows — never both', async () => {
    await setup({ rows: [row(), row({ _id: 'e2', studentId: 's2', status: 'issued', tcId: 't2', dateOfLeaving: '02 Sep 2026' })] });
    const [notIssued, issued] = Array.from(fixture.nativeElement.querySelectorAll('tbody tr')) as HTMLElement[];
    expect(notIssued.querySelector('.btn-issue')).not.toBeNull();
    expect(notIssued.querySelector('.bi-printer')).toBeNull();
    expect(notIssued.querySelector('.tag-notissued')?.textContent?.trim()).toBe('Not Issued');
    expect(issued.querySelector('.btn-issue')).toBeNull();
    expect(issued.querySelector('.bi-printer')).not.toBeNull();
    expect(issued.textContent).toContain('02 Sep 2026');
  });

  it('hides Issue TC without the tc-generate grant', async () => {
    await setup({ rows: [row()], canIssue: false });
    expect(fixture.nativeElement.querySelector('.btn-issue')).toBeNull();
  });

  it('a double click sends ONE issue request, with the modal-open idempotency key', async () => {
    await setup({ rows: [row()] });
    const pending = new Subject<TcIssueResponse>();
    api.issue.and.returnValue(pending.asObservable());
    component.openIssue(row());
    component.issue();
    component.issue();
    expect(api.issue).toHaveBeenCalledTimes(1);
    expect(api.issue.calls.mostRecent().args[4]).toBeTruthy();
    pending.next({
      message: 'TC TC-2026-0048 issued.', certificate: { _id: 't1' } as never,
      row: { studentId: 's1', status: 'issued', tcId: 't1', dateOfLeaving: '05 Sep 2026' }
    });
    expect(component.rows[0].status).toBe('issued');
    expect(component.previewOpen).toBeTrue();
  });

  it('pending fees: blocked outright without fees-waiver; acknowledgement unlocks re-submit with it', async () => {
    await setup({ rows: [row()] });
    api.issue.and.returnValue(throwError(feesError(false)));
    component.openIssue(row());
    component.issue();
    render();
    expect(component.feesPending?.canOverride).toBeFalse();
    expect(fixture.nativeElement.querySelector('.m-check')).toBeNull();

    api.issue.calls.reset();
    api.issue.and.returnValue(throwError(feesError(true)));
    component.feesPending = null;
    component.issue();
    render();
    expect(fixture.nativeElement.querySelector('.m-check')).not.toBeNull();
    component.issue();                       // not acknowledged yet → no request
    expect(api.issue).toHaveBeenCalledTimes(1);
    component.acknowledgeFees = true;
    component.issue();
    expect(api.issue).toHaveBeenCalledTimes(2);
    expect(api.issue.calls.mostRecent().args[3].acknowledgeFeesPending).toBeTrue();
  });
});
