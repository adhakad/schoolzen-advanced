/**
 * Generate Marksheet's HTTP service — /api/v2/examination/marksheets. Entering marks needs the
 * 'marksheet' edit grant; viewing, previewing and printing need its view grant.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  BulkForm, BulkSavePayload, MarksForm, MarksSavePayload, MarksheetListResponse, MarksheetPrintResponse, SavedResult
} from 'src/app/shared/models/examination/examination.model';

export interface MarksheetFilters {
  classId?: string;
  streamId?: string;
  term?: string;
  search?: string;
}

@Injectable({ providedIn: 'root' })
export class GenerateMarksheetService {
  private url = `${environment.API_URL}/api/v2/examination/marksheets`;

  constructor(private http: HttpClient) {}

  list(adminId: string, session: string, filters: MarksheetFilters, after = '', limit = 25): Observable<MarksheetListResponse> {
    const params: Record<string, string> = { adminId, session, limit: String(limit) };
    Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = String(value); });
    if (after) params['after'] = after;
    return this.http.get<MarksheetListResponse>(this.url, { params });
  }

  form(adminId: string, session: string, studentId: string, term: string): Observable<MarksForm> {
    return this.http.get<MarksForm>(`${this.url}/${studentId}/form`, { params: { adminId, session, term } });
  }

  save(adminId: string, session: string, studentId: string, payload: MarksSavePayload): Observable<{ message: string; result: SavedResult }> {
    return this.http.put<{ message: string; result: SavedResult }>(`${this.url}/${studentId}`, { adminId, session, ...payload });
  }

  bulkForm(adminId: string, session: string, term: string, studentIds: string[]): Observable<BulkForm> {
    return this.http.post<BulkForm>(`${this.url}/bulk-form`, { adminId, session, term, studentIds });
  }

  bulkSave(adminId: string, session: string, payload: BulkSavePayload): Observable<{ message: string; saved: number }> {
    return this.http.post<{ message: string; saved: number }>(`${this.url}/bulk`, { adminId, session, ...payload });
  }

  print(adminId: string, session: string, term: string, studentIds: string[]): Observable<MarksheetPrintResponse> {
    return this.http.post<MarksheetPrintResponse>(`${this.url}/print`, { adminId, session, term, studentIds });
  }
}
