import { Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { SalaryPaymentService } from 'src/app/services/salary-payment.service';

// MY SALARY — the teacher's half of a payment record.
//
// A school recording a payment is one party saying money moved. Until the teacher agrees it
// arrived, the payroll on the admin side still reads Unpaid and no payslip can be issued. This
// page is where that agreement is given, and it is the only place in the app a teacher can
// give it.
//
// NOTHING IDENTIFYING IS SENT. GET /my-payments, PUT /:id/confirm and PUT /:id/dispute all
// take the teacher from the verified JWT server-side and refuse a payment that is not theirs
// — the same division of trust pages/teacher/teacher-leave makes. There is no adminId and no
// personId anywhere in this component, deliberately: it has no way to ask about somebody
// else's salary even if it tried.
//
// TWO LISTS, NOT ONE TABLE WITH A STATUS COLUMN. The pending ones are a to-do with a deadline
// on them; the rest are a receipt book. They are not read the same way and should not look
// the same.
@Component({
  selector: 'app-teacher-salary',
  templateUrl: './teacher-salary.component.html',
  styleUrls: ['./teacher-salary.component.css']
})
export class TeacherSalaryComponent implements OnInit {
  // Awaiting this teacher's answer, and not yet lapsed. The backend decides which of those
  // two things a row is; this page never re-derives it against the browser's own clock.
  pendingList: any[] = [];
  historyList: any[] = [];
  loader: Boolean = true;

  // The dispute form is per-row and opened in place: a modal for one text field, on a page
  // that is otherwise a list, would be more ceremony than the action deserves.
  disputeFor: any = null;
  disputeReason: string = '';

  errorCheck: Boolean = false;
  errorMsg: String = '';
  // Double-submit guard, reset in BOTH callbacks of every mutating call.
  isClick: boolean = false;

  monthOptions = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
  ];

  constructor(
    private toastr: ToastrService,
    private salaryPaymentService: SalaryPaymentService,
  ) { }

  ngOnInit(): void {
    this.getMyPayments();
  }

  getMyPayments(): void {
    this.salaryPaymentService.getMyPayments().subscribe(
      (res: any) => {
        this.pendingList = (res && res.pending) ? res.pending : [];
        this.historyList = (res && res.history) ? res.history : [];
        this.loader = false;
      },
      (err: any) => {
        this.pendingList = [];
        this.historyList = [];
        this.loader = false;
        this.showError(err);
      }
    );
  }

  monthLabel(month: number): string {
    const found = this.monthOptions.find((option) => option.value === Number(month));
    return found ? found.label : '';
  }

  paymentModeLabel(mode: String): string {
    switch (mode) {
      case 'cash': return 'Cash';
      case 'bankTransfer': return 'Bank Transfer';
      case 'upi': return 'UPI';
      case 'cheque': return 'Cheque';
      default: return '';
    }
  }

  confirmationLabel(status: String): string {
    switch (status) {
      case 'PendingConfirmation': return 'Awaiting your confirmation';
      case 'Disputed': return 'Disputed';
      case 'Expired': return 'Expired';
      default: return 'Confirmed';
    }
  }

  confirmationClass(status: String): string {
    switch (status) {
      case 'PendingConfirmation': return 'confirm-pending';
      case 'Disputed': return 'confirm-disputed';
      case 'Expired': return 'confirm-expired';
      default: return 'confirm-confirmed';
    }
  }

  /**
   * How long is left, in whole hours, rounded up.
   *
   * Hours rather than a live countdown: the window is a day long, the page is opened for a
   * minute at a time, and a ticking clock on a 24-hour deadline is theatre. Rounded UP so
   * "1 hour left" never means four minutes.
   */
  hoursLeft(row: any): number {
    if (!row || !row.confirmationExpiresAt) return 0;
    const remaining = new Date(row.confirmationExpiresAt).getTime() - Date.now();
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / (60 * 60 * 1000));
  }

  expiryNote(row: any): string {
    const hours = this.hoursLeft(row);
    if (hours <= 0) return 'This confirmation request has expired.';
    if (hours === 1) return 'This confirmation request expires in less than an hour.';
    return `This confirmation request expires in ${hours} hours.`;
  }

  confirmPayment(row: any): void {
    if (this.isClick) return;
    this.isClick = true;
    this.errorCheck = false;
    this.salaryPaymentService.confirmPayment(row._id).subscribe(
      (res: any) => {
        this.isClick = false;
        this.closeDispute();
        // Refetched rather than moved in place: confirming is what makes the payment count,
        // and the row belongs in the history list from that moment on.
        this.getMyPayments();
        setTimeout(() => { this.toastr.success('Payment receipt confirmed.'); }, 500);
      },
      (err: any) => { this.isClick = false; this.showError(err); this.toastr.error(this.readError(err)); }
    );
  }

  disputeModel(row: any): void {
    this.disputeFor = row;
    this.disputeReason = '';
    this.errorCheck = false;
    this.errorMsg = '';
  }

  closeDispute(): void {
    this.disputeFor = null;
    this.disputeReason = '';
  }

  submitDispute(): void {
    // The backend requires a reason and rejects a blank one; stopping it here saves the round
    // trip and says why in the same place the text was typed.
    if (!this.disputeReason || this.disputeReason.trim().length < 3) {
      this.errorCheck = true;
      this.errorMsg = 'Say briefly what is wrong, so the school knows what to look at.';
      return;
    }
    if (this.isClick) return;
    this.isClick = true;
    this.salaryPaymentService.disputePayment(this.disputeFor._id, {
      disputeReason: this.disputeReason.trim(),
    }).subscribe(
      (res: any) => {
        this.isClick = false;
        this.closeDispute();
        this.getMyPayments();
        setTimeout(() => {
          this.toastr.success('Dispute raised. The school has been asked to review it.');
        }, 500);
      },
      (err: any) => { this.isClick = false; this.showError(err); }
    );
  }

  // The backend returns business-rule failures as a plain STRING, not an object — see
  // CLAUDE.md's backend error-handling convention.
  readError(err: any): string {
    if (!err) return 'Something went wrong!';
    if (typeof err.error === 'string') return err.error;
    if (err.error && err.error.errorMsg) return err.error.errorMsg;
    if (typeof err.message === 'string') return err.message;
    return 'Something went wrong!';
  }

  showError(err: any): void {
    this.errorCheck = true;
    this.errorMsg = this.readError(err);
  }
}
