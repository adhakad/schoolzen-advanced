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
}
