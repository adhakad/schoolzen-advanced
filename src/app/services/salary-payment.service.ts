import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SalaryPayment } from '../modal/salary-payment.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SalaryPaymentService {
  url = `${environment.API_URL}/v1/salary-payment`;
  constructor(private http: HttpClient) { }

  // The Payment History tab. Pages LOCKED payrolls with their payments attached, so an unpaid
  // one still appears — that is the row the tab exists to act on.
  paymentHistoryList(data: any) {
    return this.http.post(`${this.url}/payment-history`, data);
  }
  getPaymentsForPayroll(payrollId: String) {
    return this.http.get<SalaryPayment[]>(`${this.url}/payroll/${payrollId}`);
  }
  // Allowed only against a LOCKED payroll, and only up to the remaining balance — both
  // enforced on the backend.
  recordPayment(data: SalaryPayment) {
    return this.http.post(this.url, data);
  }

  // ---- The employee side, behind the teacher token ----------------------
  // Nothing identifying is sent on any of these. The backend resolves the teacher from
  // the verified JWT and refuses a payment that is not theirs, so this service has no way
  // to act on somebody else even if it tried — the same division leave-request.service.ts
  // makes between its admin and teacher entry points.

  // { pending: [...], history: [...] } — pending is what still needs an answer, and only
  // requests that have not lapsed appear in it.
  getMyPayments() {
    return this.http.get(`${this.url}/my-payments`);
  }
  // One way, and refused once the 24-hour window has closed. Confirming is what makes the
  // payment count toward the payroll as paid.
  confirmPayment(id: String) {
    return this.http.put(`${this.url}/${id}/confirm`, {});
  }
  // data: { disputeReason }. Flags the payment for the school to look at; it does not
  // reverse or delete anything.
  disputePayment(id: String, data: any) {
    return this.http.put(`${this.url}/${id}/dispute`, data);
  }
}
