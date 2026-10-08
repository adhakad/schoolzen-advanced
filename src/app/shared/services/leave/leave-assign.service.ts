/**
 * Leave Assign's HTTP service — thin wrappers around /api/v2/leave/assign. Every endpoint is
 * gated server-side on the 'leave-limit' permission.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  AssignItem, AssignResponse, ClassGridResponse, ClassStudentRow, ClassTargetRef, StaffGridResponse
} from 'src/app/shared/models/leave/leave-limit.model';
import { LeavePersonType } from 'src/app/shared/models/leave/leave-request.model';
import { LeaveType } from 'src/app/shared/models/leave/leave-type.model';

const compact = (values: Record<string, string | number | null | undefined>): Record<string, string> => {
  const params: Record<string, string> = {};
  Object.entries(values).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) params[key] = String(value);
  });
  return params;
};

@Injectable({ providedIn: 'root' })
export class LeaveAssignService {
  private url = `${environment.API_URL}/api/v2/leave/assign`;

  constructor(private http: HttpClient) {}

  getStaffGrid(adminId: string, filters: { session: string; departmentId: string; designationId: string; search: string; page: number; limit: number }): Observable<StaffGridResponse> {
    return this.http.get<StaffGridResponse>(`${this.url}/staff`, { params: compact({ adminId, ...filters }) });
  }

  bulkAssignStaff(body: { adminId: string; session: string; personIds: string[]; items: AssignItem[] }): Observable<AssignResponse> {
    return this.http.post<AssignResponse>(`${this.url}/staff/bulk`, body);
  }

  getClassGrid(adminId: string, filters: { session: string; classId: string; streamId: string; sectionId: string }): Observable<ClassGridResponse> {
    return this.http.get<ClassGridResponse>(`${this.url}/classes`, { params: compact({ adminId, ...filters }) });
  }

  getClassStudents(adminId: string, session: string, target: ClassTargetRef, groupId: string): Observable<{ leaveTypes: LeaveType[]; rows: ClassStudentRow[] }> {
    return this.http.get<{ leaveTypes: LeaveType[]; rows: ClassStudentRow[] }>(`${this.url}/classes/students`, {
      params: compact({ adminId, session, classId: target.classId, streamId: target.streamId, sectionId: target.sectionId, groupId })
    });
  }

  /** `overwriteOverrides` + `confirmed` only after the admin confirmed the 409. */
  assignClasses(body: { adminId: string; session: string; targets: ClassTargetRef[]; items: AssignItem[]; overwriteOverrides: boolean; confirmed: boolean }): Observable<AssignResponse> {
    return this.http.post<AssignResponse>(`${this.url}/classes`, body);
  }

  setPersonLimit(body: { adminId: string; session: string; personType: LeavePersonType; personId: string; leaveTypeId: string; days: number }): Observable<AssignResponse & { limit: { allocated: number; used: number; source: string } }> {
    return this.http.put<AssignResponse & { limit: { allocated: number; used: number; source: string } }>(`${this.url}/limit`, body);
  }
}
