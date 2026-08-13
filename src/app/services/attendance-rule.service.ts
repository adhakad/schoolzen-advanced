import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AttendanceRule } from '../modal/attendance-rule.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AttendanceRuleService {
  url = `${environment.API_URL}/v1/attendance-rule`;
  constructor(private http: HttpClient) { }

  getAttendanceRule(adminId: any) {
    return this.http.get<any>(`${this.url}/${adminId}`);
  }
  addAttendanceRule(attendanceRuleData: AttendanceRule) {
    return this.http.post(this.url, attendanceRuleData);
  }
  updateAttendanceRule(attendanceRuleData: AttendanceRule) {
    return this.http.put(`${this.url}/${attendanceRuleData._id}`, attendanceRuleData);
  }
}
