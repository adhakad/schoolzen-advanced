import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Staff } from '../modal/staff.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class StaffService {
  url = `${environment.API_URL}/v1/staff`;
  constructor(private http: HttpClient) { }

  addStaff(staffData: Staff) {
    return this.http.post(this.url, staffData);
  }
  getStaffList(adminId: any) {
    return this.http.get<Staff[]>(`${this.url}/all-staff/${adminId}`);
  }
  getStaffCount(adminId: any) {
    return this.http.get(`${this.url}/staff-count/${adminId}`);
  }
  staffPaginationList(staffData: any) {
    return this.http.post(`${this.url}/staff-pagination`, staffData);
  }
  updateStaff(staffData: Staff) {
    return this.http.put(`${this.url}/${staffData._id}`, staffData);
  }
  deleteStaff(id: String) {
    return this.http.delete(`${this.url}/${id}`);
  }
}
