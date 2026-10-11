/**
 * Holidays' HTTP service — thin wrappers around /api/v2/holiday/holidays.
 * No error handling here: the shared ErrorInterceptor surfaces everything except
 * ValidationError, which the page binds to its own fields.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  GenerateResponse, Holiday, HolidayListResponse, HolidayPayload, SystemHolidayEntry, SystemHolidayState
} from 'src/app/shared/models/holiday/holiday.model';

@Injectable({ providedIn: 'root' })
export class HolidaysService {
  private base = `${environment.API_URL}/api/v2/holiday`;
  private url = `${this.base}/holidays`;

  constructor(private http: HttpClient) {}

  getHolidays(adminId: string, options: { search?: string; month?: string; page?: number; limit?: number } = {}): Observable<HolidayListResponse> {
    const params: Record<string, string> = { adminId };
    if (options.search) params['search'] = options.search;
    if (options.month) params['month'] = options.month;
    if (options.page) params['page'] = String(options.page);
    if (options.limit) params['limit'] = String(options.limit);
    return this.http.get<HolidayListResponse>(this.url, { params });
  }

  /** Every holiday — the Templates checklist and the month-filter calendar. */
  getOptions(adminId: string): Observable<{ rows: Holiday[] }> {
    return this.http.get<{ rows: Holiday[] }>(`${this.url}/options`, { params: { adminId } });
  }

  createHoliday(payload: HolidayPayload): Observable<{ message: string; holiday: Holiday }> {
    return this.http.post<{ message: string; holiday: Holiday }>(this.url, payload);
  }

  updateHoliday(id: string, payload: HolidayPayload): Observable<{ message: string; holiday: Holiday }> {
    return this.http.put<{ message: string; holiday: Holiday }>(`${this.url}/${id}`, payload);
  }

  deleteHoliday(adminId: string, id: string): Observable<{ message: string; templatesTouched: number }> {
    return this.http.delete<{ message: string; templatesTouched: number }>(`${this.url}/${id}`, { params: { adminId } });
  }

  getSystemStates(adminId: string): Observable<{ rows: SystemHolidayState[] }> {
    return this.http.get<{ rows: SystemHolidayState[] }>(`${this.base}/system-holidays/states`, { params: { adminId } });
  }

  /** One state's official holidays for a year — Generate's preview list. */
  getSystemHolidays(adminId: string, state: string, year: number): Observable<{ rows: SystemHolidayEntry[] }> {
    return this.http.get<{ rows: SystemHolidayEntry[] }>(`${this.base}/system-holidays`, { params: { adminId, state, year: String(year) } });
  }

  /** `selected`: the ticked "name|date" keys of the preview list. */
  generate(adminId: string, state: string, year: number, selected?: string[]): Observable<GenerateResponse> {
    return this.http.post<GenerateResponse>(`${this.url}/generate`, { adminId, state, year, ...(selected ? { selected } : {}) });
  }
}
