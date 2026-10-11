/** Holiday Assign's HTTP service — /api/v2/holiday/assign and the coverage count. */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { PersonFilterValue } from 'src/app/shared/models/leave/person-filter.model';
import {
  HolidayAssignGridResponse, HolidayAssignPayload, HolidayCoverage, HolidayPersonType
} from 'src/app/shared/models/holiday/holiday-assign.model';

@Injectable({ providedIn: 'root' })
export class HolidayAssignService {
  private base = `${environment.API_URL}/api/v2/holiday`;

  constructor(private http: HttpClient) {}

  getGrid(adminId: string, session: string, filter: PersonFilterValue, options: { search?: string; page: number; limit: number }): Observable<HolidayAssignGridResponse> {
    const params: Record<string, string> = { adminId, personType: filter.personType, page: String(options.page), limit: String(options.limit) };
    if (session) params['session'] = session;
    if (options.search) params['search'] = options.search;
    (['departmentId', 'designationId', 'classId', 'streamId', 'groupId', 'sectionId'] as const).forEach((key) => {
      if (filter[key]) params[key] = filter[key];
    });
    return this.http.get<HolidayAssignGridResponse>(`${this.base}/assign`, { params });
  }

  assign(payload: HolidayAssignPayload): Observable<{ message: string; count: number }> {
    return this.http.post<{ message: string; count: number }>(`${this.base}/assign`, payload);
  }

  unassign(adminId: string, session: string, personType: HolidayPersonType, personIds: string[]): Observable<{ message: string; count: number }> {
    return this.http.post<{ message: string; count: number }>(`${this.base}/assign/remove`, { adminId, session, personType, personIds });
  }

  /** People with no template yet — the Leave / Attendance banner. */
  getCoverage(adminId: string, session: string): Observable<HolidayCoverage> {
    const params: Record<string, string> = { adminId };
    if (session) params['session'] = session;
    return this.http.get<HolidayCoverage>(`${this.base}/coverage`, { params });
  }
}
