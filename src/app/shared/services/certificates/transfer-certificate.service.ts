/**
 * Generate TC's HTTP service — /api/v2/certificates/tc. Issue needs 'tc-generate' and carries
 * an Idempotency-Key generated once per modal open; pending fees need 'fees-waiver' plus an
 * explicit acknowledgement (both enforced by the API).
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { idempotencyHeaders } from 'src/app/shared/utils/idempotency.util';
import {
  TcCertificate, TcFilters, TcIssueDraft, TcIssuePayload, TcIssueResponse, TcListResponse
} from 'src/app/shared/models/certificates/certificates.model';

@Injectable({ providedIn: 'root' })
export class TransferCertificateService {
  private url = `${environment.API_URL}/api/v2/certificates/tc`;

  constructor(private http: HttpClient) {}

  list(adminId: string, session: string, filters: TcFilters, after = '', limit = 10): Observable<TcListResponse> {
    const params: Record<string, string> = { adminId, session, limit: String(limit) };
    Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = String(value); });
    if (after) params['after'] = after;
    return this.http.get<TcListResponse>(`${this.url}/students`, { params });
  }

  draft(adminId: string, session: string, studentId: string, dateOfLeaving = ''): Observable<TcIssueDraft> {
    const params: Record<string, string> = { adminId, session };
    if (dateOfLeaving) params['dateOfLeaving'] = dateOfLeaving;
    return this.http.get<TcIssueDraft>(`${this.url}/students/${studentId}/draft`, { params });
  }

  issue(adminId: string, session: string, studentId: string, payload: TcIssuePayload, key?: string): Observable<TcIssueResponse> {
    return this.http.post<TcIssueResponse>(`${this.url}/students/${studentId}/issue`,
      { adminId, session, ...payload }, { headers: idempotencyHeaders(key) });
  }

  get(adminId: string, id: string): Observable<TcCertificate> {
    return this.http.get<TcCertificate>(`${this.url}/${id}`, { params: { adminId } });
  }
}
