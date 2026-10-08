/**
 * Attendance Overview's HTTP service — thin wrappers around /api/v2/attendance.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  DayPunches, GridQuery, GridResponse, LiveStatus, PersonType, RecentArrivals, SyncResponse
} from 'src/app/shared/models/attendance/attendance.model';

@Injectable({ providedIn: 'root' })
export class AttendanceOverviewService {
  private url = `${environment.API_URL}/api/v2/attendance`;

  constructor(private http: HttpClient) {}

  getGrid(adminId: string, query: GridQuery): Observable<GridResponse> {
    const params: Record<string, string> = { adminId };
    Object.entries(query).forEach(([key, value]) => { if (value) params[key] = String(value); });
    return this.http.get<GridResponse>(`${this.url}/grid`, { params });
  }

  getLiveStatus(adminId: string): Observable<LiveStatus> {
    return this.http.get<LiveStatus>(`${this.url}/live-status`, { params: { adminId } });
  }

  getRecentArrivals(adminId: string): Observable<RecentArrivals> {
    return this.http.get<RecentArrivals>(`${this.url}/recent-arrivals`, { params: { adminId } });
  }

  getDayPunches(adminId: string, personType: PersonType, personId: string, date: string): Observable<DayPunches> {
    return this.http.get<DayPunches>(`${this.url}/day-punches`, { params: { adminId, personType, personId, date } });
  }

  /** Only ever called after the confirm modal — `confirmed` is the server's backstop. */
  syncNow(adminId: string): Observable<SyncResponse> {
    return this.http.post<SyncResponse>(`${this.url}/sync`, { adminId, confirmed: true });
  }
}
