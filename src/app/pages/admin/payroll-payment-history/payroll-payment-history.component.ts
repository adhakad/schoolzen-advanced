import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { SalaryPaymentService } from 'src/app/services/salary-payment.service';
import { SalarySlipService } from 'src/app/services/salary-slip.service';
import { SchoolService } from 'src/app/services/school.service';
import { PrintPdfService } from 'src/app/services/print-pdf/print-pdf.service';

// PAYMENT HISTORY — recording that money moved, and issuing the payslip that says so.
//
// Its own lazy route, opened from the Payroll page's settings menu, which passes the month,
// year and Staff/Teachers selection along as query params so this page opens on the period
// that was being looked at rather than resetting to today.
//
// TWO PARTIES, NOT ONE. Recording a payment no longer settles it. A teacher has 24 hours to
// confirm receipt, and until they do the payroll still reads Unpaid — see
// services/salary-payment-status.js on the backend. That is why a row can show money against
// it and still say Unpaid, and why the confirmation badge is on every payment line rather
// than being an admin-only detail. Staff have no login in this system, so their payments are
// confirmed on creation; the badge says so.
//
// THE SLIP IS A SEPARATE MODAL from the one modalMode drives. It is a printable document, not
// a form: it uses the wider print-model-dialog and its body is the thing that gets sent to the
// printer, so sharing the compact form modal would fight both layouts.
@Component({
  selector: 'app-payroll-payment-history',
  templateUrl: './payroll-payment-history.component.html',
  styleUrls: ['./payroll-payment-history.component.css']
})
export class PayrollPaymentHistoryComponent implements OnInit {
  adminId!: string;
  adminName: string = '';

  // '' | 'payment'
  showModal: boolean = false;
  modalMode: string = '';
  errorCheck: Boolean = false;
  errorMsg: String = '';
  // Double-submit guard, reset in BOTH callbacks of every mutating call.
  isClick: boolean = false;

  // ---- Scope selection ----------------------------------------------------
  personTypeFilter: string = 'staff';
  filterMonth: number = new Date().getMonth() + 1;
  filterYear: number = new Date().getFullYear();
  monthOptions = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
  ];
  yearOptions: number[] = [];

  // ---- The list -----------------------------------------------------------
  paymentForm: FormGroup;
  historyList: any[] = [];
  paymentNumber: number = 0;
  paymentLimit: number = 5;
  paymentPaginationValues: Subject<any> = new Subject();
  paymentLoader: Boolean = true;
  paymentModeFilter: string = 'all';
  paymentStatusFilter: string = 'all';
  paymentRow: any = null;

  // ---- Salary slip --------------------------------------------------------
  showSlipModal: boolean = false;
  slipPayload: any = null;
  slipLoading: boolean = false;
  // Read once on init and reused by every slip — the school's own header block. Nothing about
  // a slip asks the admin to re-enter it.
  schoolInfo: any = null;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private adminAuthService: AdminAuthService,
    private salaryPaymentService: SalaryPaymentService,
    private salarySlipService: SalarySlipService,
    private schoolService: SchoolService,
    private printPdfService: PrintPdfService,
  ) {
    this.paymentForm = this.fb.group({
      amountPaid: ['', Validators.required],
      paymentDate: ['', Validators.required],
      paymentMode: ['', Validators.required],
      referenceNumber: [''],
      remarks: [''],
    })
  }

  ngOnInit(): void {
    const admin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = admin?.id;
    this.adminName = admin?.name || '';
    this.buildYearOptions();
    this.applyScopeFromQuery();
    this.getSchool();
    let load: any = this.getPaymentHistory({ page: 1 });
    if (load) {
      setTimeout(() => { this.paymentLoader = false; }, 1000);
    }
  }

  buildYearOptions(): void {
    const thisYear = new Date().getFullYear();
    for (let year = thisYear - 2; year <= thisYear + 1; year += 1) {
      this.yearOptions.push(year);
    }
  }

  // Carried from the Payroll page's settings menu. All three are absent on a direct URL,
  // which falls back to this month and Staff rather than failing — the page has to work when
  // it is opened cold, which is also how the lazy route gets verified.
  private applyScopeFromQuery(): void {
    const params = this.route.snapshot.queryParamMap;
    const personType = params.get('personType');
    if (personType === 'staff' || personType === 'teacher') this.personTypeFilter = personType;

    const month = Number(params.get('month'));
    if (month >= 1 && month <= 12) this.filterMonth = month;

    const year = Number(params.get('year'));
    if (this.yearOptions.indexOf(year) > -1) this.filterYear = year;
  }

  // ---- Plain-language labels ---------------------------------------------

  personTypeLabel(personType: String): string {
    return personType === 'teacher' ? 'Teachers' : 'Staff';
  }

  modeLabel(mode: String): string {
    if (mode === 'perDay') return 'Per Day';
    if (mode === 'perMonth') return 'Per Month';
    return '';
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

  monthLabel(month: number): string {
    const found = this.monthOptions.find((option) => option.value === Number(month));
    return found ? found.label : '';
  }

  paymentStatusClass(status: String): string {
    if (status === 'Fully Paid') return 'status-fullypaid';
    if (status === 'Partially Paid') return 'status-partiallypaid';
    return 'status-unpaid';
  }

  // A payment written before confirmation existed carries no status at all, and it WAS
  // settled money at the time — it reads as Confirmed rather than as something the employee
  // has failed to answer.
  confirmationLabel(status: String): string {
    switch (status) {
      case 'PendingConfirmation': return 'Awaiting Confirmation';
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

  // =========================================================================
  // THE LIST
  // =========================================================================

  getPaymentHistory($event: any) {
    return new Promise((resolve) => {
      let params: any = {
        filters: {
          personType: this.personTypeFilter,
          month: this.filterMonth,
          year: this.filterYear,
          paymentMode: this.paymentModeFilter === 'all' ? '' : this.paymentModeFilter,
          paymentStatus: this.paymentStatusFilter === 'all' ? '' : this.paymentStatusFilter,
        },
        page: $event.page,
        limit: $event.limit ? $event.limit : this.paymentLimit,
        adminId: this.adminId,
      };
      this.paymentLimit = params.limit;

      this.salaryPaymentService.paymentHistoryList(params).subscribe((res: any) => {
        if (res) {
          this.historyList = res.historyList;
          this.paymentNumber = params.page;
          this.paymentPaginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countPayroll });
          return resolve(true);
        }
      });
    });
  }

  switchPeriod(): void {
    this.getPaymentHistory({ page: 1 });
  }

  switchPersonType(): void {
    this.getPaymentHistory({ page: 1 });
  }

  switchPaymentFilter(): void {
    this.getPaymentHistory({ page: 1 });
  }

  // Only a locked payroll with something still owed can take a payment. remainingAmount is
  // already net of anything awaiting confirmation, so this will not offer to pay again what
  // has been handed over once and not yet acknowledged.
  canRecordPayment(row: any): boolean {
    return row.paymentStatus !== 'Fully Paid' && row.remainingAmount > 0;
  }

  recordPaymentModel(row: any): void {
    this.paymentRow = row;
    this.errorCheck = false;
    this.errorMsg = '';
    this.paymentForm.reset({
      // Pre-filled with what is actually outstanding — the common case is paying it in full,
      // and the remainder after an advance is a number nobody should have to work out.
      amountPaid: row.remainingAmount,
      paymentDate: new Date(),
      paymentMode: '',
      referenceNumber: '',
      remarks: '',
    });
    this.modalMode = 'payment';
    this.showModal = true;
  }

  recordPayment(): void {
    if (this.paymentForm.invalid) {
      this.paymentForm.markAllAsTouched();
      return;
    }
    if (this.isClick) return;
    this.isClick = true;

    // personType/personId are deliberately NOT sent - the backend copies them off the
    // referenced Payroll, which is the authority on whose salary this is.
    this.salaryPaymentService.recordPayment({
      adminId: this.adminId,
      payrollId: this.paymentRow.payrollId,
      amountPaid: Number(this.paymentForm.value.amountPaid),
      paymentDate: this.paymentForm.value.paymentDate,
      paymentMode: this.paymentForm.value.paymentMode,
      referenceNumber: this.paymentForm.value.referenceNumber || '',
      paidBy: this.adminName || this.adminId,
      remarks: this.paymentForm.value.remarks || '',
    } as any).subscribe(
      (res: any) => {
        this.isClick = false;
        this.closeModal();
        this.getPaymentHistory({ page: this.paymentNumber || 1 });
        // The backend's own wording, because it differs by person type: a teacher's payment
        // is still awaiting them, a staff member's is done.
        setTimeout(() => {
          this.toastr.success(typeof res === 'string' ? res : 'Payment recorded successfully.');
        }, 500);
      },
      (err: any) => { this.isClick = false; this.showError(err); }
    );
  }

  // =========================================================================
  // SALARY SLIP
  //
  // Issuable only once the payroll is LOCKED and CONFIRMED money has moved against it — a
  // slip documents a payment both sides agree happened, not a calculation and not a claim.
  //
  // The print path builds an HTML string with inline styles and hands it to
  // PrintPdfService.printContent(), which opens it in a fresh window and prints it. The
  // styles are inlined rather than read from this component's stylesheet because that window
  // is a new document with none of Angular's scoped CSS in it.
  // =========================================================================

  getSchool(): void {
    this.schoolService.getSchool(this.adminId).subscribe(
      (res: any) => { if (res) this.schoolInfo = res; },
      () => { this.schoolInfo = null; }
    );
  }

  // A locked row with at least one CONFIRMED payment. paymentStatus is derived from confirmed
  // money only, so a teacher who has not yet acknowledged their salary correctly leaves this
  // false — the backend refuses the slip in that state too.
  canGenerateSlip(row: any): boolean {
    return row.paymentStatus === 'Fully Paid' || row.paymentStatus === 'Partially Paid';
  }

  // One call whether a slip exists or not: the backend issues one if there is none and
  // refreshes it if there is, keeping the original slip number either way.
  generateSlipModel(row: any): void {
    if (this.isClick) return;
    this.isClick = true;
    this.slipPayload = null;
    this.slipLoading = true;
    this.showSlipModal = true;

    this.salarySlipService.generateSalarySlip({
      adminId: this.adminId,
      payrollId: row.payrollId,
      generatedBy: this.adminName || this.adminId,
    }).subscribe(
      (res: any) => {
        this.isClick = false;
        this.slipLoading = false;
        this.slipPayload = res;
      },
      (err: any) => {
        this.isClick = false;
        this.slipLoading = false;
        this.showSlipModal = false;
        this.toastr.error(this.readError(err));
      }
    );
  }

  closeSlipModal(): void {
    this.showSlipModal = false;
    this.slipPayload = null;
    this.slipLoading = false;
  }

  printSalarySlip(): void {
    const printContent = this.getSlipPrintContent();
    this.printPdfService.printContent(printContent);
    this.closeSlipModal();
  }

  /**
   * The payslip's print stylesheet.
   *
   * A CORPORATE PAYSLIP, NOT A FEE RECEIPT. The two documents are read by different people
   * for different reasons: a receipt is handed to a parent at a counter and is deliberately
   * ornamental, while a payslip is a salary record an employee files, shows a bank, and
   * attaches to a loan application. So this drops the receipt's A3 sheet, its watermark and
   * its heavy rules, and uses the plain navy-banded, small-type layout every payslip a person
   * has ever been given already looks like — the point is that it reads as unremarkable.
   *
   * A4 because that is what a payslip is filed on. Everything sized to keep one month on one
   * page without the reader having to hunt across a fold.
   */
  private getSlipPrintContent(): string {
    let css = '';
    css += '@page { size: A4; margin: 10mm; }';
    css += 'body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; }';
    css += 'div { margin: 0; padding: 0; }';
    // The print window is a bare document: without this the browser's default paragraph
    // margins push the header and footer blocks apart and the slip runs onto a second page.
    css += 'p { margin: 0; padding: 0; }';
    css += 'img { max-width: 100%; }';
    css += 'table { border-collapse: collapse; }';
    css += '.ps-sheet { width: 100%; box-sizing: border-box; border: 1px solid #c9ccd6; }';
    // Header strip. The one place colour is used structurally rather than decoratively.
    css += '.ps-head { background: #1F3864; color: #ffffff; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; }';
    css += '.ps-head-left { display: flex; align-items: center; gap: 10px; }';
    css += '.ps-logo { height: 46px; width: auto; }';
    css += '.ps-school { font-size: 15px; font-weight: bold; letter-spacing: .3px; margin: 0 0 2px 0; color: #ffffff; }';
    css += '.ps-school-line { font-size: 9.5px; line-height: 1.45; margin: 0; color: #dce3f2; }';
    css += '.ps-head-right { text-align: right; }';
    css += '.ps-title { font-size: 17px; font-weight: bold; letter-spacing: 2px; margin: 0; color: #ffffff; }';
    css += '.ps-period { font-size: 10.5px; margin: 2px 0 0 0; color: #dce3f2; }';
    // Meta strip.
    css += '.ps-meta { background: #eef0f5; border-bottom: 1px solid #c9ccd6; padding: 5px 14px; display: flex; justify-content: space-between; font-size: 9.5px; color: #3c4257; }';
    css += '.ps-meta strong { color: #1F3864; }';
    // Employee block.
    css += '.ps-emp { display: flex; flex-wrap: wrap; padding: 10px 14px 4px 14px; }';
    css += '.ps-emp-item { width: 50%; box-sizing: border-box; padding: 0 8px 7px 0; }';
    css += '.ps-label { display: block; font-size: 8.5px; letter-spacing: .6px; text-transform: uppercase; color: #77809a; margin-bottom: 1px; }';
    css += '.ps-value { display: block; font-size: 11.5px; font-weight: bold; color: #1a1a1a; }';
    // Attendance strip.
    css += '.ps-att { display: flex; background: #f4f5f8; border-top: 1px solid #dfe2ea; border-bottom: 1px solid #dfe2ea; padding: 7px 14px; }';
    css += '.ps-att-cell { flex: 1; text-align: center; }';
    css += '.ps-att-num { display: block; font-size: 15px; font-weight: bold; color: #1F3864; line-height: 1.2; }';
    css += '.ps-att-lab { display: block; font-size: 8.5px; letter-spacing: .5px; text-transform: uppercase; color: #77809a; }';
    // Earnings / deductions, side by side.
    css += '.ps-cols { display: flex; padding: 0; }';
    css += '.ps-col { width: 50%; box-sizing: border-box; }';
    css += '.ps-col + .ps-col { border-left: 1px solid #dfe2ea; }';
    css += '.ps-col table { width: 100%; }';
    css += '.ps-col th { background: #f4f5f8; text-align: left; font-size: 9px; letter-spacing: .8px; text-transform: uppercase; color: #3c4257; padding: 6px 14px; border-bottom: 1px solid #dfe2ea; }';
    css += '.ps-col th.ps-amt, .ps-col td.ps-amt { text-align: right; }';
    css += '.ps-col td { font-size: 11px; padding: 4px 14px; }';
    css += '.ps-sub td { font-weight: bold; border-top: 1px solid #dfe2ea; background: #fafbfd; padding-top: 6px; padding-bottom: 6px; }';
    // Net pay banner.
    css += '.ps-net { background: #1F3864; color: #ffffff; display: flex; align-items: center; justify-content: space-between; padding: 9px 14px; }';
    css += '.ps-net-lab { font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; color: #ffffff; }';
    css += '.ps-net-amt { font-size: 19px; font-weight: bold; color: #ffffff; }';
    css += '.ps-words { font-style: italic; font-size: 10px; color: #3c4257; padding: 6px 14px 0 14px; }';
    // Payment row.
    css += '.ps-pay { display: flex; padding: 8px 14px 10px 14px; border-bottom: 1px solid #dfe2ea; }';
    css += '.ps-pay-item { flex: 1; }';
    // Footer.
    css += '.ps-foot { display: flex; justify-content: space-between; align-items: flex-end; padding: 16px 14px 8px 14px; }';
    css += '.ps-sign { width: 45%; }';
    css += '.ps-sign-line { border-top: 1px solid #6b7280; margin-top: 26px; padding-top: 3px; font-size: 9.5px; color: #3c4257; }';
    css += '.ps-print { width: 50%; text-align: right; font-size: 8.5px; line-height: 1.5; color: #77809a; }';
    css += '.ps-note { text-align: center; font-size: 8.5px; color: #9aa1b1; padding: 0 14px 10px 14px; }';
    // The bands are the layout, not decoration — a printer dropping backgrounds would leave
    // the header and the net-pay row as unlabelled white space.
    css += '@media print { * { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; } }';

    let printHtml = '<html><head><style>' + css + '</style></head><body>';
    const slipElement = document.getElementById('salary-slip');
    if (slipElement) {
      printHtml += slipElement.outerHTML;
    }
    printHtml += '</body></html>';
    return printHtml;
  }

  // Rupee-prefixed, no decimals — the same formatCurrency every printed document in this app
  // uses, so money reads identically across them.
  formatCurrency(value: any): string {
    const amount = parseInt(value);
    if (!isNaN(amount)) {
      return '₹ ' + amount.toLocaleString(undefined);
    }
    return '₹ 0';
  }

  // =========================================================================
  // SHARED
  // =========================================================================

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

  closeModal(): void {
    this.showModal = false;
    this.modalMode = '';
    this.errorCheck = false;
    this.errorMsg = '';
    this.paymentRow = null;
  }
}
