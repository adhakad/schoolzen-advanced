/**
 * The Departments page's HTTP service — thin wrappers around /api/v2/staff/departments.
 * No error handling here: the shared ErrorInterceptor shapes and surfaces everything except
 * ValidationError, which the page binds to its own fields.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  Department, DepartmentListResponse, DepartmentPayload, DepartmentSaveResponse
} from 'src/app/shared/models/staff/department.model';

@Injectable({ providedIn: 'root' })
export class DepartmentsService {
  private url = `${environment.API_URL}/api/v2/staff/departments`;

  constructor(private http: HttpClient) {}

  getDepartments(adminId: string, options: { search?: string; page?: number; limit?: number } = {}): Observable<DepartmentListResponse> {
    const params: Record<string, string> = { adminId };
    if (options.search) params['search'] = options.search;
    if (options.page) params['page'] = String(options.page);
    if (options.limit) params['limit'] = String(options.limit);
    return this.http.get<DepartmentListResponse>(this.url, { params });
  }

  /** Every department — the dropdown source on Designations and Manage Staff (one cached key). */
  getOptions(adminId: string): Observable<{ rows: Department[] }> {
    return this.http.get<{ rows: Department[] }>(`${this.url}/options`, { params: { adminId } });
  }

  createDepartment(payload: DepartmentPayload): Observable<DepartmentSaveResponse> {
    return this.http.post<DepartmentSaveResponse>(this.url, payload);
  }

  updateDepartment(id: string, payload: DepartmentPayload): Observable<DepartmentSaveResponse> {
    return this.http.put<DepartmentSaveResponse>(`${this.url}/${id}`, payload);
  }

  /** `confirmed` is the server-side backstop behind the typed-DELETE gate. */
  deleteDepartment(adminId: string, id: string, confirmed: boolean): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.url}/${id}`, { params: { adminId, confirmed: String(confirmed) } });
  }
}
