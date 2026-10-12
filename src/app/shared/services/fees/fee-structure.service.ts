/**
 * Fee Structure's HTTP service — thin wrappers around /api/v2/fees/structures. Writes are
 * gated server-side on the 'fees-structure' edit permission.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  FeeStructureListResponse, FeeStructurePayload, FeeStructureRow
} from 'src/app/shared/models/fees/fees.model';

export interface FeeStructureFilters {
  classId: string;
  streamId: string;
  groupId: string;
  search: string;
  page: number;
  limit: number;
}

@Injectable({ providedIn: 'root' })
export class FeeStructureService {
  private url = `${environment.API_URL}/api/v2/fees/structures`;

  constructor(private http: HttpClient) {}

  list(adminId: string, session: string, filters: FeeStructureFilters): Observable<FeeStructureListResponse> {
    const params: Record<string, string> = { adminId, session };
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) params[key] = String(value);
    });
    return this.http.get<FeeStructureListResponse>(this.url, { params });
  }

  get(adminId: string, id: string): Observable<{ structure: FeeStructureRow }> {
    return this.http.get<{ structure: FeeStructureRow }>(`${this.url}/${id}`, { params: { adminId } });
  }

  create(payload: FeeStructurePayload): Observable<{ message: string; structure: FeeStructureRow }> {
    return this.http.post<{ message: string; structure: FeeStructureRow }>(this.url, payload);
  }

  update(id: string, payload: FeeStructurePayload): Observable<{ message: string; structure: FeeStructureRow }> {
    return this.http.put<{ message: string; structure: FeeStructureRow }>(`${this.url}/${id}`, payload);
  }

  /** `confirm` must be the typed word DELETE. */
  remove(adminId: string, id: string, confirm: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.url}/${id}`, { params: { adminId, confirm } });
  }
}
