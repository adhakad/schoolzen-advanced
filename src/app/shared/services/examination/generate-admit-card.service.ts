/**
 * Generate Admit Card's HTTP service — /api/v2/examination/admit-cards. Read + print only
 * (the 'admit-card' grant); every card comes from Admit Card Structure's generation job.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AdmitCardListResponse, AdmitCardPrintResponse } from 'src/app/shared/models/examination/examination.model';

export interface AdmitCardFilters {
  classId?: string;
  streamId?: string;
  groupId?: string;
  sectionId?: string;
  search?: string;
}

@Injectable({ providedIn: 'root' })
export class GenerateAdmitCardService {
  private url = `${environment.API_URL}/api/v2/examination/admit-cards`;

  constructor(private http: HttpClient) {}

  list(adminId: string, session: string, filters: AdmitCardFilters, after = '', limit = 25): Observable<AdmitCardListResponse> {
    const params: Record<string, string> = { adminId, session, limit: String(limit) };
    Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = String(value); });
    if (after) params['after'] = after;
    return this.http.get<AdmitCardListResponse>(this.url, { params });
  }

  print(adminId: string, session: string, cardIds: string[]): Observable<AdmitCardPrintResponse> {
    return this.http.post<AdmitCardPrintResponse>(`${this.url}/print`, { adminId, session, cardIds });
  }
}
