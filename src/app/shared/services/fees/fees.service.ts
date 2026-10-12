/**
 * Fees' HTTP service — /api/v2/fees/collection and receipts. Collect needs 'fees-collect'
 * and the concession edit 'fees-waiver' (enforced by the API); both carry an
 * Idempotency-Key generated once per modal open.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { idempotencyHeaders } from 'src/app/shared/utils/idempotency.util';
import {
  CollectResponse, FeeFilters, FeeReceipt, FeeRow, FeesListResponse, PaymentMode, ReportPeriod
} from 'src/app/shared/models/fees/fees.model';

@Injectable({ providedIn: 'root' })
export class FeesService {
  private url = `${environment.API_URL}/api/v2/fees`;

  constructor(private http: HttpClient) {}

  list(adminId: string, session: string, filters: FeeFilters, after = '', limit = 25): Observable<FeesListResponse> {
    const params: Record<string, string> = { adminId, session, limit: String(limit) };
    Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = String(value); });
    if (after) params['after'] = after;
    return this.http.get<FeesListResponse>(`${this.url}/collection`, { params });
  }

  collect(adminId: string, session: string, studentId: string, amount: number, mode: PaymentMode, key?: string): Observable<CollectResponse> {
    return this.http.post<CollectResponse>(`${this.url}/collection/${studentId}/collect`,
      { adminId, session, amount, mode }, { headers: idempotencyHeaders(key) });
  }

  updateConcession(adminId: string, session: string, studentId: string, amount: number, reason: string, key?: string):
    Observable<{ message: string; row: FeeRow }> {
    return this.http.put<{ message: string; row: FeeRow }>(`${this.url}/collection/${studentId}/concession`,
      { adminId, session, amount, reason }, { headers: idempotencyHeaders(key) });
  }

  receipt(adminId: string, paymentId: string): Observable<{ receipt: FeeReceipt }> {
    return this.http.get<{ receipt: FeeReceipt }>(`${this.url}/payments/${paymentId}/receipt`, { params: { adminId } });
  }

  report(adminId: string, session: string, filters: FeeFilters, period: ReportPeriod, studentIds: string[]):
    Observable<{ rows: FeeRow[]; period: { key: string; from: string; to: string }; truncated: boolean }> {
    return this.http.post<{ rows: FeeRow[]; period: { key: string; from: string; to: string }; truncated: boolean }>(
      `${this.url}/collection/report`, { adminId, session, ...filters, period, studentIds });
  }
}
