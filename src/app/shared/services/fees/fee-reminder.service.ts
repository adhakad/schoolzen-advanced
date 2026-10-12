/**
 * Fee Reminder's HTTP service — /api/v2/fees/reminders. Previews always hit the server (the
 * live list is never cached anywhere); Send Now returns a jobId the page follows.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { idempotencyHeaders } from 'src/app/shared/utils/idempotency.util';
import {
  ReminderFilterFields, ReminderFilterRow, ReminderListResponse, ReminderRecipient
} from 'src/app/shared/models/fees/fees.model';

export interface SendResponse {
  message: string;
  jobId: string;
  queued: number;
  filter?: ReminderFilterRow | null;
}

@Injectable({ providedIn: 'root' })
export class FeeReminderService {
  private url = `${environment.API_URL}/api/v2/fees/reminders`;

  constructor(private http: HttpClient) {}

  list(adminId: string): Observable<ReminderListResponse> {
    return this.http.get<ReminderListResponse>(this.url, { params: { adminId } });
  }

  create(adminId: string, filter: ReminderFilterFields): Observable<{ message: string; filter: ReminderFilterRow }> {
    return this.http.post<{ message: string; filter: ReminderFilterRow }>(this.url, { adminId, ...filter });
  }

  remove(adminId: string, id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.url}/${id}`, { params: { adminId } });
  }

  /** A saved filter's live list — re-run on every call. */
  previewSaved(adminId: string, session: string, id: string): Observable<{ rows: ReminderRecipient[] }> {
    return this.http.get<{ rows: ReminderRecipient[] }>(`${this.url}/${id}/preview`, { params: { adminId, session } });
  }

  /** An unsaved filter's live list (Create → Choose Filters). */
  preview(adminId: string, session: string, filter: ReminderFilterFields): Observable<{ rows: ReminderRecipient[] }> {
    return this.http.post<{ rows: ReminderRecipient[] }>(`${this.url}/preview`, { adminId, session, ...filter });
  }

  sendSaved(adminId: string, session: string, id: string, studentIds: string[], key?: string): Observable<SendResponse> {
    return this.http.post<SendResponse>(`${this.url}/${id}/send`, { adminId, session, studentIds }, { headers: idempotencyHeaders(key) });
  }

  send(adminId: string, session: string, filter: ReminderFilterFields, studentIds: string[], saveFilter: boolean, key?: string):
    Observable<SendResponse> {
    return this.http.post<SendResponse>(`${this.url}/send`, { adminId, session, ...filter, studentIds, saveFilter },
      { headers: idempotencyHeaders(key) });
  }
}
