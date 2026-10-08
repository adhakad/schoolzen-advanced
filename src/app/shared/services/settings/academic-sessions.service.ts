/**
 * Settings → Academic Sessions — thin wrappers around /api/v2/settings/academic-sessions.
 * No error handling here: ErrorInterceptor surfaces everything except inline-form errors.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  ActivateSessionResponse, CopyForwardOptionsResponse, CreateSessionPayload, CreateSessionResponse,
  SessionListResponse
} from 'src/app/shared/models/settings/academic-session.model';
import { idempotencyHeaders } from 'src/app/shared/utils/idempotency.util';

@Injectable({ providedIn: 'root' })
export class AcademicSessionsService {
  private url = `${environment.API_URL}/api/v2/settings/academic-sessions`;

  constructor(private http: HttpClient) {}

  getSessions(adminId: string, page = 1, limit = 10): Observable<SessionListResponse> {
    return this.http.get<SessionListResponse>(this.url, {
      params: { adminId, page: String(page), limit: String(limit) }
    });
  }

  getCopyForwardOptions(adminId: string): Observable<CopyForwardOptionsResponse> {
    return this.http.get<CopyForwardOptionsResponse>(`${this.url}/copy-forward-options`, { params: { adminId } });
  }

  createSession(payload: CreateSessionPayload, key?: string): Observable<CreateSessionResponse> {
    return this.http.post<CreateSessionResponse>(this.url, payload, { headers: idempotencyHeaders(key) });
  }

  activateSession(adminId: string, id: string, confirmLabel: string): Observable<ActivateSessionResponse> {
    return this.http.post<ActivateSessionResponse>(`${this.url}/${id}/activate`, { adminId, confirmLabel });
  }

  /** `confirm=DELETE` is the server's backstop behind the UI's type-to-confirm gate. */
  deleteSession(adminId: string, id: string): Observable<unknown> {
    return this.http.delete(`${this.url}/${id}`, { params: { adminId, confirm: 'DELETE' } });
  }
}
