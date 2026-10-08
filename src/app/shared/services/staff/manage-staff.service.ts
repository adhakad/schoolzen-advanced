/**
 * Manage Staff's HTTP service — thin wrappers around /api/v2/staff/members.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  StaffAssignCardsPayload, StaffAssignCardsResponse, StaffBulkDeleteResponse, StaffListQuery,
  StaffListResponse, StaffPayload, StaffRow
} from 'src/app/shared/models/staff/staff.model';

@Injectable({ providedIn: 'root' })
export class ManageStaffService {
  private url = `${environment.API_URL}/api/v2/staff/members`;

  constructor(private http: HttpClient) {}

  getStaff(adminId: string, query: StaffListQuery = {}): Observable<StaffListResponse> {
    const params: Record<string, string> = { adminId };
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params[key] = String(value);
    });
    return this.http.get<StaffListResponse>(this.url, { params });
  }

  createStaff(payload: StaffPayload): Observable<{ message: string; staff: StaffRow }> {
    return this.http.post<{ message: string; staff: StaffRow }>(this.url, payload);
  }

  updateStaff(id: string, payload: StaffPayload): Observable<{ message: string; staff: StaffRow }> {
    return this.http.put<{ message: string; staff: StaffRow }>(`${this.url}/${id}`, payload);
  }

  /** Soft terminate + explicit access revocation, one request for the whole selection. */
  bulkDelete(adminId: string, ids: string[]): Observable<StaffBulkDeleteResponse> {
    return this.http.post<StaffBulkDeleteResponse>(`${this.url}/bulk-delete`, { adminId, ids });
  }

  assignCards(payload: StaffAssignCardsPayload): Observable<StaffAssignCardsResponse> {
    return this.http.post<StaffAssignCardsResponse>(`${this.url}/cards`, payload);
  }

  removeCard(adminId: string, id: string): Observable<{ message: string; jobId: string }> {
    return this.http.post<{ message: string; jobId: string }>(`${this.url}/${id}/card-remove`, { adminId });
  }
}
