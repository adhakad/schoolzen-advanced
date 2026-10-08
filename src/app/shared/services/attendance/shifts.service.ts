/**
 * Manage Shifts' HTTP service — thin wrappers around /api/v2/attendance/shifts.
 * No error handling here: the shared ErrorInterceptor surfaces everything except
 * ValidationError, which the page binds to its own fields.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Shift, ShiftListResponse, ShiftPayload, ShiftSaveResponse } from 'src/app/shared/models/attendance/shift.model';

@Injectable({ providedIn: 'root' })
export class ShiftsService {
  private url = `${environment.API_URL}/api/v2/attendance/shifts`;

  constructor(private http: HttpClient) {}

  getShifts(adminId: string, options: { search?: string; page?: number; limit?: number } = {}): Observable<ShiftListResponse> {
    const params: Record<string, string> = { adminId };
    if (options.search) params['search'] = options.search;
    if (options.page) params['page'] = String(options.page);
    if (options.limit) params['limit'] = String(options.limit);
    return this.http.get<ShiftListResponse>(this.url, { params });
  }

  /** Every shift — Roster's assign dropdown (one cached key server-side). */
  getOptions(adminId: string): Observable<{ rows: Shift[] }> {
    return this.http.get<{ rows: Shift[] }>(`${this.url}/options`, { params: { adminId } });
  }

  createShift(payload: ShiftPayload): Observable<ShiftSaveResponse> {
    return this.http.post<ShiftSaveResponse>(this.url, payload);
  }

  updateShift(id: string, payload: ShiftPayload): Observable<ShiftSaveResponse> {
    return this.http.put<ShiftSaveResponse>(`${this.url}/${id}`, payload);
  }

  deleteShift(adminId: string, id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.url}/${id}`, { params: { adminId } });
  }
}
