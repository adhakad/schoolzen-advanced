import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BulkAssignResult, LeaveAssignmentGrid } from '../modal/leave-assignment.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class LeaveAssignmentService {
  url = `${environment.API_URL}/v1/leave-assignment`;
  constructor(private http: HttpClient) { }

  // params: { adminId, personType, class? }. `class` is REQUIRED for students — the backend
  // 400s without it, because a whole school's roll is not a usable grid.
  getLeaveAssignmentGrid(params: any) {
    return this.http.get<LeaveAssignmentGrid>(`${this.url}/grid`, { params });
  }
  // data: { adminId, leaveTypeIds: [], persons: [{ personType, personId }] }
  // Idempotent server-side: a person who already has that type is skipped, never reset, so
  // the single-cell "Assign" link and the bulk panel can share this one call.
  bulkAssignLeave(data: any) {
    return this.http.post<BulkAssignResult>(`${this.url}/bulk-assign`, data);
  }
}
