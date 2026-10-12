/**
 * Assign Salary's HTTP service — thin wrappers around /api/v2/payroll/assign. Every
 * endpoint is gated server-side on the 'payroll-assign' permission.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  AssignGridResponse, BulkAssignResponse, SalaryAssignmentCell, SalaryOverrides
} from 'src/app/shared/models/payroll/assign-salary.model';

const compact = (values: Record<string, string | number>): Record<string, string> => {
  const params: Record<string, string> = {};
  Object.entries(values).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) params[key] = String(value);
  });
  return params;
};

@Injectable({ providedIn: 'root' })
export class AssignSalaryService {
  private url = `${environment.API_URL}/api/v2/payroll/assign`;

  constructor(private http: HttpClient) {}

  grid(adminId: string, filters: { departmentId: string; designationId: string; search: string; page: number; limit: number }): Observable<AssignGridResponse> {
    return this.http.get<AssignGridResponse>(this.url, { params: compact({ adminId, ...filters }) });
  }

  assign(body: { adminId: string; staffId: string; salaryGroupId: string; effectiveFrom: string; overrides: SalaryOverrides }): Observable<{ message: string; assignment: SalaryAssignmentCell }> {
    return this.http.put<{ message: string; assignment: SalaryAssignmentCell }>(this.url, body);
  }

  bulkAssign(body: { adminId: string; staffIds: string[]; salaryGroupId: string; effectiveFrom: string }): Observable<BulkAssignResponse> {
    return this.http.post<BulkAssignResponse>(`${this.url}/bulk`, body);
  }
}
