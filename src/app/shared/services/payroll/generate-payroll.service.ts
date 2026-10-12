/**
 * Generate Payroll's HTTP service — thin wrappers around /api/v2/payroll/runs. Every write
 * is gated server-side on the 'payroll-generate' permission and carries the Idempotency-Key
 * the page made for that action.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { idempotencyHeaders } from 'src/app/shared/utils/idempotency.util';
import {
  BulkGenerateResponse, PayrollRunListResponse, PayrollRunStatus, RunMutationResponse
} from 'src/app/shared/models/payroll/payroll-run.model';

export interface RunFilters {
  departmentId: string;
  designationId: string;
  search: string;
  status: PayrollRunStatus | '';
  year: number;
  month: number;
  after: string;
  limit: number;
}

@Injectable({ providedIn: 'root' })
export class GeneratePayrollService {
  private url = `${environment.API_URL}/api/v2/payroll/runs`;

  constructor(private http: HttpClient) {}

  list(adminId: string, filters: RunFilters): Observable<PayrollRunListResponse> {
    const params: Record<string, string> = { adminId };
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) params[key] = String(value);
    });
    return this.http.get<PayrollRunListResponse>(this.url, { params });
  }

  generate(body: { adminId: string; staffId: string; year: number; month: number }, key?: string): Observable<RunMutationResponse> {
    return this.http.post<RunMutationResponse>(`${this.url}/generate`, body, { headers: idempotencyHeaders(key) });
  }

  bulkGenerate(body: { adminId: string; staffIds: string[]; year: number; month: number }, key?: string): Observable<BulkGenerateResponse> {
    return this.http.post<BulkGenerateResponse>(`${this.url}/generate/bulk`, body, { headers: idempotencyHeaders(key) });
  }

  lock(adminId: string, id: string, key?: string): Observable<RunMutationResponse> {
    return this.http.post<RunMutationResponse>(`${this.url}/${id}/lock`, { adminId }, { headers: idempotencyHeaders(key) });
  }

  unlock(adminId: string, id: string, key?: string): Observable<RunMutationResponse> {
    return this.http.post<RunMutationResponse>(`${this.url}/${id}/unlock`, { adminId }, { headers: idempotencyHeaders(key) });
  }
}
