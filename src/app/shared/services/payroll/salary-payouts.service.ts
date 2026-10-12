/**
 * Salary Payouts' HTTP service — thin wrappers around /api/v2/payroll/payouts. Recording a
 * payment and issuing a slip are gated server-side on the 'payroll-payout' permission.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { idempotencyHeaders } from 'src/app/shared/utils/idempotency.util';
import {
  PaymentMode, PayoutListResponse, PayoutRow, PayoutStatus, RecordPaymentPayload, SalarySlip
} from 'src/app/shared/models/payroll/salary-payout.model';

export interface PayoutFilters {
  departmentId: string;
  designationId: string;
  search: string;
  mode: PaymentMode | '';
  status: PayoutStatus | '';
  year: number;
  month: number;
  after: string;
  limit: number;
}

@Injectable({ providedIn: 'root' })
export class SalaryPayoutsService {
  private url = `${environment.API_URL}/api/v2/payroll/payouts`;

  constructor(private http: HttpClient) {}

  list(adminId: string, filters: PayoutFilters): Observable<PayoutListResponse> {
    const params: Record<string, string> = { adminId };
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) params[key] = String(value);
    });
    return this.http.get<PayoutListResponse>(this.url, { params });
  }

  recordPayment(runId: string, payload: RecordPaymentPayload, key?: string): Observable<{ message: string; row: PayoutRow }> {
    return this.http.post<{ message: string; row: PayoutRow }>(`${this.url}/${runId}/payments`, payload, { headers: idempotencyHeaders(key) });
  }

  /** Issues the slip on first call, returns the same one afterwards. */
  slip(adminId: string, runId: string): Observable<{ slip: SalarySlip }> {
    return this.http.post<{ slip: SalarySlip }>(`${this.url}/${runId}/slip`, { adminId });
  }
}
