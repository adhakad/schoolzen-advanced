/**
 * Roster's HTTP service — thin wrappers around /api/v2/attendance/roster.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  BulkWriteResponse, ClassShiftResponse, ClassTarget, StaffRosterResponse
} from 'src/app/shared/models/attendance/roster.model';

@Injectable({ providedIn: 'root' })
export class RosterService {
  private url = `${environment.API_URL}/api/v2/attendance/roster`;

  constructor(private http: HttpClient) {}

  getStaffRoster(adminId: string, filters: { month: string; departmentId?: string; designationId?: string; search?: string }): Observable<StaffRosterResponse> {
    const params: Record<string, string> = { adminId, month: filters.month };
    if (filters.departmentId) params['departmentId'] = filters.departmentId;
    if (filters.designationId) params['designationId'] = filters.designationId;
    if (filters.search) params['search'] = filters.search;
    return this.http.get<StaffRosterResponse>(`${this.url}/staff`, { params });
  }

  assignStaff(body: { adminId: string; staffIds: string[]; shiftId: string; month: string; weekdays: number[] }): Observable<BulkWriteResponse> {
    return this.http.post<BulkWriteResponse>(`${this.url}/staff/assign`, body);
  }

  /** `confirmed` is the server-side backstop behind the typed-DELETE gate. */
  clearStaff(body: { adminId: string; staffIds: string[]; month: string; confirmed: true }): Observable<BulkWriteResponse> {
    return this.http.post<BulkWriteResponse>(`${this.url}/staff/clear`, body);
  }

  getClassShifts(adminId: string, session: string): Observable<ClassShiftResponse> {
    return this.http.get<ClassShiftResponse>(`${this.url}/classes`, { params: { adminId, session } });
  }

  assignClasses(body: { adminId: string; session: string; targets: ClassTarget[]; shiftId: string }): Observable<BulkWriteResponse> {
    return this.http.post<BulkWriteResponse>(`${this.url}/classes/assign`, body);
  }

  clearClasses(body: { adminId: string; session: string; targets: ClassTarget[]; confirmed: true }): Observable<BulkWriteResponse> {
    return this.http.post<BulkWriteResponse>(`${this.url}/classes/clear`, body);
  }
}
