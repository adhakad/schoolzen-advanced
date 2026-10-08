/**
 * The Designations page's HTTP service — thin wrappers around /api/v2/staff/designations.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  Designation, DesignationListResponse, DesignationPayload
} from 'src/app/shared/models/staff/designation.model';

@Injectable({ providedIn: 'root' })
export class DesignationsService {
  private url = `${environment.API_URL}/api/v2/staff/designations`;

  constructor(private http: HttpClient) {}

  /** `departmentId`: an id, 'none' (standalone only), or '' for every designation. */
  getDesignations(
    adminId: string,
    options: { search?: string; departmentId?: string; page?: number; limit?: number } = {}
  ): Observable<DesignationListResponse> {
    const params: Record<string, string> = { adminId };
    if (options.search) params['search'] = options.search;
    if (options.departmentId) params['departmentId'] = options.departmentId;
    if (options.page) params['page'] = String(options.page);
    if (options.limit) params['limit'] = String(options.limit);
    return this.http.get<DesignationListResponse>(this.url, { params });
  }

  /** Every designation — Manage Staff filters this client-side by department. */
  getOptions(adminId: string): Observable<{ rows: Designation[] }> {
    return this.http.get<{ rows: Designation[] }>(`${this.url}/options`, { params: { adminId } });
  }

  createDesignation(payload: DesignationPayload): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(this.url, payload);
  }

  updateDesignation(id: string, payload: DesignationPayload): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.url}/${id}`, payload);
  }

  deleteDesignation(adminId: string, id: string, confirmed: boolean): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.url}/${id}`, { params: { adminId, confirmed: String(confirmed) } });
  }
}
