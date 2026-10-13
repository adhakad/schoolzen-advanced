/**
 * Dashboard's HTTP service — thin wrappers around /api/v2/dashboard. One call loads every
 * widget the viewer may see; `getWidget` refetches a single one (live hint, Retry, calendar
 * month change). Which widgets come back is decided by the server's permission check.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  DashboardResponse, DashboardWidgetKey, DashboardWidgetResponse
} from 'src/app/shared/models/dashboard/dashboard.model';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private url = `${environment.API_URL}/api/v2/dashboard`;

  constructor(private http: HttpClient) {}

  getDashboard(adminId: string, session: string): Observable<DashboardResponse> {
    return this.http.get<DashboardResponse>(this.url, { params: { adminId, session } });
  }

  getWidget<K extends DashboardWidgetKey>(adminId: string, key: K, session: string, month = ''): Observable<DashboardWidgetResponse<K>> {
    const params: Record<string, string> = { adminId, session };
    if (month) params['month'] = month;
    return this.http.get<DashboardWidgetResponse<K>>(`${this.url}/widgets/${key}`, { params });
  }
}
