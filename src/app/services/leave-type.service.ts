import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LeaveType } from '../modal/leave-type.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class LeaveTypeService {
  url = `${environment.API_URL}/v1/leave-type`;
  constructor(private http: HttpClient) { }

  addLeaveType(leaveTypeData: LeaveType) {
    return this.http.post(this.url, leaveTypeData);
  }
  getLeaveTypeList(adminId: any) {
    return this.http.get<LeaveType[]>(`${this.url}/all-leave-type/${adminId}`);
  }
  // Only ACTIVE types this person type may actually take — what the apply form's dropdown
  // reads. The full list above is the settings page's, and includes inactive ones.
  getApplicableLeaveTypeList(adminId: any, personType: any) {
    return this.http.get<LeaveType[]>(`${this.url}/applicable/${adminId}/${personType}`);
  }
  getLeaveTypeCount(adminId: any) {
    return this.http.get(`${this.url}/leave-type-count/${adminId}`);
  }
  leaveTypePaginationList(leaveTypeData: any) {
    return this.http.post(`${this.url}/leave-type-pagination`, leaveTypeData);
  }
  updateLeaveType(leaveTypeData: LeaveType) {
    return this.http.put(`${this.url}/${leaveTypeData._id}`, leaveTypeData);
  }
  deleteLeaveType(id: String) {
    return this.http.delete(`${this.url}/${id}`);
  }
}
