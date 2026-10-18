/**
 * Attendance Overview's HTTP service — thin wrappers around /api/v2/attendance.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { idempotencyHeaders } from 'src/app/shared/utils/idempotency.util';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  DayPunches, GridQuery, GridResponse, LiveStatus, MarkRequest, MarkResponse, PersonType, RecentArrivals, SyncResponse, SyncStatus
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

  getRecentArrivals(adminId: string, session = ''): Observable<RecentArrivals> {
    // The header's session, so students resolve against it (shared-fix1.md S2).
    const params: Record<string, string> = session ? { adminId, session } : { adminId };
    return this.http.get<RecentArrivals>(`${this.url}/recent-arrivals`, { params });
  }

  getDayPunches(adminId: string, personType: PersonType, personId: string, date: string): Observable<DayPunches> {
    return this.http.get<DayPunches>(`${this.url}/day-punches`, { params: { adminId, personType, personId, date } });
  }

  /** Only ever called after the confirm modal — `confirmed` is the server's backstop. */
  syncNow(adminId: string): Observable<SyncResponse> {
    return this.http.post<SyncResponse>(`${this.url}/sync`, { adminId, confirmed: true });
  }

  getSyncStatus(adminId: string): Observable<SyncStatus> {
    return this.http.get<SyncStatus>(`${this.url}/sync-status`, { params: { adminId } });
  }

  /**
   * Manual status marking — today only, server time; `key` is the popover's Idempotency-Key.
   * Students also carry the grid's session + class context (class-first rule).
   */
  mark(adminId: string, body: MarkRequest, key: string): Observable<MarkResponse> {
    return this.http.post<MarkResponse>(`${this.url}/mark`, { adminId, ...body }, { headers: idempotencyHeaders(key) });
  }
}
