/**
 * Leave Requests' HTTP service — thin wrappers around /api/v2/leave/requests.
 * Apply / Approve / Reject carry the Idempotency-Key the page made when the modal opened
 * (utils/idempotency.util.ts) — leave/optimization.md.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { idempotencyHeaders } from 'src/app/shared/utils/idempotency.util';
import {
  ApplyLeavePayload, LeaveActionResponse, LeaveBalanceResponse, LeavePersonOption, LeavePersonType,
  LeaveRequestFilters, LeaveRequestListResponse
} from 'src/app/shared/models/leave/leave-request.model';

@Injectable({ providedIn: 'root' })
export class LeaveRequestsService {
  private url = `${environment.API_URL}/api/v2/leave/requests`;

  constructor(private http: HttpClient) {}

  getRequests(adminId: string, filters: LeaveRequestFilters): Observable<LeaveRequestListResponse> {
    const params: Record<string, string> = { adminId };
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) params[key] = String(value);
    });
    return this.http.get<LeaveRequestListResponse>(this.url, { params });
  }

  getPeople(adminId: string, session: string, personType: LeavePersonType, search: string): Observable<{ rows: LeavePersonOption[] }> {
    const params: Record<string, string> = { adminId, personType };
    if (session) params['session'] = session;
    if (search) params['search'] = search;
    return this.http.get<{ rows: LeavePersonOption[] }>(`${this.url}/people`, { params });
  }

  getBalance(adminId: string, session: string, personType: LeavePersonType, personId: string, leaveTypeId: string): Observable<LeaveBalanceResponse> {
    const params: Record<string, string> = { adminId, personType, personId, leaveTypeId };
    if (session) params['session'] = session;
    return this.http.get<LeaveBalanceResponse>(`${this.url}/balance`, { params });
  }

  apply(payload: ApplyLeavePayload, key?: string): Observable<LeaveActionResponse> {
    return this.http.post<LeaveActionResponse>(this.url, payload, { headers: idempotencyHeaders(key) });
  }

  /** `forceApprove` only after the admin confirmed "approve anyway". */
  approve(adminId: string, id: string, forceApprove: boolean, key?: string): Observable<LeaveActionResponse> {
    return this.http.put<LeaveActionResponse>(`${this.url}/${id}/approve`, { adminId, forceApprove }, { headers: idempotencyHeaders(key) });
  }

  reject(adminId: string, id: string, key?: string): Observable<LeaveActionResponse> {
    return this.http.put<LeaveActionResponse>(`${this.url}/${id}/reject`, { adminId }, { headers: idempotencyHeaders(key) });
  }

  cancel(adminId: string, id: string, reason: string): Observable<LeaveActionResponse> {
    return this.http.put<LeaveActionResponse>(`${this.url}/${id}/cancel`, { adminId, reason });
  }

  delete(adminId: string, id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.url}/${id}`, { params: { adminId } });
  }
}
