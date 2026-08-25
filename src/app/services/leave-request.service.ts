import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LeaveBalance } from '../modal/leave-request.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class LeaveRequestService {
  url = `${environment.API_URL}/v1/leave-request`;
  constructor(private http: HttpClient) { }

  // params: { adminId, filters: { status, personType, personId }, page, limit }
  leaveRequestPaginationList(params: any) {
    return this.http.post(`${this.url}/leave-request-pagination`, params);
  }
  // params: { adminId, personType, personId, year }
  getLeaveBalance(params: any) {
    return this.http.get<LeaveBalance[]>(`${this.url}/balance`, { params });
  }
  getSingleLeaveRequest(id: String) {
    return this.http.get(`${this.url}/${id}`);
  }
  // Admin: may file for any person in the school. Dates are "YYYY-MM-DD" strings.
  addLeaveRequest(data: any) {
    return this.http.post(this.url, data);
  }
  // Teacher: adminId and the teacher's own personId come from the JWT server-side, so
  // neither is sent — the backend schema does not declare them and strips them anyway.
  addTeacherLeaveRequest(data: any) {
    return this.http.post(`${this.url}/teacher`, data);
  }
  // data: { actionBy, forceApprove? }. forceApprove skips the balance check and nothing else
  // — every other guard still applies. Sent only after the admin confirms the overdraw.
  approveLeaveRequest(id: String, data: any) {
    return this.http.put(`${this.url}/${id}/approve`, data);
  }
  rejectLeaveRequest(id: String, data: any) {
    return this.http.put(`${this.url}/${id}/reject`, data);
  }
  // Takes back an APPROVED leave without losing the record: the request survives as
  // 'Cancelled' with its reason, its leaveDates and its dayCount, and only the attendance
  // rows the approval wrote are removed. Delete below is the other undo and erases the row.
  // data: { cancellationReason, actionBy }
  cancelLeaveRequest(id: String, data: any) {
    return this.http.patch(`${this.url}/${id}/cancel`, data);
  }
  // Deleting an APPROVED request also removes the DailyAttendance rows it wrote and queues
  // those days for recompute — this is the undo path, not just a list tidy-up.
  deleteLeaveRequest(id: String) {
    return this.http.delete(`${this.url}/${id}`);
  }
}
