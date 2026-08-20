import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { AttendanceCalendar, AttendanceMonthGrid, AttendancePerson, PunchLogEntry } from '../modal/attendance.model';

@Injectable({
  providedIn: 'root'
})
export class AttendanceService {
  url = `${environment.API_URL}/v1/attendance`;
  constructor(private http: HttpClient) { }

  // params: { adminId, personType, personId, year, month } — month is 1-12, not JS 0-11
  getAttendanceCalendar(params: any) {
    return this.http.get<AttendanceCalendar>(`${this.url}/calendar`, { params });
  }
  // The grid. params: { adminId, personType, year, month, class? } — class is REQUIRED for
  // students; the backend 400s without it rather than serving a 60,000-cell table.
  getAttendanceCalendarMonth(params: any) {
    return this.http.get<AttendanceMonthGrid>(`${this.url}/calendar-month`, { params });
  }
  getDaySummary(params: any) {
    return this.http.get(`${this.url}/day-summary`, { params });
  }
  // params: { adminId, personType, class? } — class narrows the student list
  getAttendancePeople(params: any) {
    return this.http.get<AttendancePerson[]>(`${this.url}/people`, { params });
  }
  getPunchLog(params: any) {
    return this.http.get<PunchLogEntry[]>(`${this.url}/punch-log`, { params });
  }
  getSyncState(params: any) {
    return this.http.get(`${this.url}/sync-state`, { params });
  }
  addManualAttendance(data: any) {
    return this.http.post(`${this.url}/manual`, data);
  }
  // DELETE with a body — matches the backend route, same shape as RosterService.deleteRoster
  deleteManualAttendance(data: any) {
    return this.http.delete(`${this.url}/manual`, { body: data });
  }
  syncSchoolNow(data: any) {
    return this.http.post(`${this.url}/sync-now`, data);
  }
  getQueueHealth() {
    return this.http.get(`${this.url}/health`);
  }
}
