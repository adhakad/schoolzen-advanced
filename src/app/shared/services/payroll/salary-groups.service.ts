/**
 * Salary Groups' HTTP service — thin wrappers around /api/v2/payroll/salary-groups.
 * Writes are gated server-side on the 'payroll' edit permission.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { SalaryGroup, SalaryGroupListResponse, SalaryGroupPayload } from 'src/app/shared/models/payroll/salary-group.model';

@Injectable({ providedIn: 'root' })
export class SalaryGroupsService {
  private url = `${environment.API_URL}/api/v2/payroll/salary-groups`;

  constructor(private http: HttpClient) {}

  list(adminId: string, filters: { search: string; page: number; limit: number }): Observable<SalaryGroupListResponse> {
    const params: Record<string, string> = { adminId, page: String(filters.page), limit: String(filters.limit) };
    if (filters.search) params['search'] = filters.search;
    return this.http.get<SalaryGroupListResponse>(this.url, { params });
  }

  /** Active groups only — the Assign Salary dropdown. Needs 'payroll-assign'. */
  options(adminId: string): Observable<{ rows: SalaryGroup[] }> {
    return this.http.get<{ rows: SalaryGroup[] }>(`${this.url}/options`, { params: { adminId } });
  }

  create(payload: SalaryGroupPayload): Observable<{ message: string; salaryGroup: SalaryGroup }> {
    return this.http.post<{ message: string; salaryGroup: SalaryGroup }>(this.url, payload);
  }

  update(id: string, payload: SalaryGroupPayload): Observable<{ message: string; salaryGroup: SalaryGroup }> {
    return this.http.put<{ message: string; salaryGroup: SalaryGroup }>(`${this.url}/${id}`, payload);
  }

  /** `confirm` must be the typed word DELETE. */
  remove(adminId: string, id: string, confirm: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.url}/${id}`, { params: { adminId, confirm } });
  }
}
