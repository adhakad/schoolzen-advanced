/**
 * Leave Create's HTTP service — thin wrappers around /api/v2/leave/types.
 * No error handling here: the shared ErrorInterceptor surfaces everything except
 * ValidationError, which the page binds to its own fields.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { LeaveType, LeaveTypeListResponse, LeaveTypePayload } from 'src/app/shared/models/leave/leave-type.model';

@Injectable({ providedIn: 'root' })
export class LeaveTypesService {
  private url = `${environment.API_URL}/api/v2/leave/types`;

  constructor(private http: HttpClient) {}

  getTypes(adminId: string, options: { search?: string; page?: number; limit?: number } = {}): Observable<LeaveTypeListResponse> {
    const params: Record<string, string> = { adminId };
    if (options.search) params['search'] = options.search;
    if (options.page) params['page'] = String(options.page);
    if (options.limit) params['limit'] = String(options.limit);
    return this.http.get<LeaveTypeListResponse>(this.url, { params });
  }

  /** Every type, or (with `applicableTo`) only the active ones that person type may take. */
  getOptions(adminId: string, applicableTo = ''): Observable<{ rows: LeaveType[] }> {
    const params: Record<string, string> = { adminId };
    if (applicableTo) params['applicableTo'] = applicableTo;
    return this.http.get<{ rows: LeaveType[] }>(`${this.url}/options`, { params });
  }

  createType(payload: LeaveTypePayload): Observable<{ message: string; leaveType: LeaveType }> {
    return this.http.post<{ message: string; leaveType: LeaveType }>(this.url, payload);
  }

  updateType(id: string, payload: LeaveTypePayload): Observable<{ message: string; leaveType: LeaveType }> {
    return this.http.put<{ message: string; leaveType: LeaveType }>(`${this.url}/${id}`, payload);
  }

  deleteType(adminId: string, id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.url}/${id}`, { params: { adminId } });
  }
}
