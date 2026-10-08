/**
 * Settings → Marksheet Templates — thin wrappers around /api/v2/settings/marksheet-templates.
 * No error handling here: ErrorInterceptor surfaces everything except inline-form errors.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  AssignPayload, AssignPreview, AssignResponse, MarksheetTemplatesResponse
} from 'src/app/shared/models/settings/marksheet-template.model';

@Injectable({ providedIn: 'root' })
export class MarksheetTemplatesService {
  private url = `${environment.API_URL}/api/v2/settings/marksheet-templates`;

  constructor(private http: HttpClient) {}

  getTemplates(adminId: string): Observable<MarksheetTemplatesResponse> {
    return this.http.get<MarksheetTemplatesResponse>(this.url, { params: { adminId } });
  }

  /** What "Use This Template" would do to this class — fetched before confirming. */
  getAssignPreview(adminId: string, templateId: string, classId: string, streamId: string | null): Observable<AssignPreview> {
    const params: Record<string, string> = { adminId, templateId, classId };
    if (streamId) params['streamId'] = streamId;
    return this.http.get<AssignPreview>(`${this.url}/assign-preview`, { params });
  }

  assign(payload: AssignPayload): Observable<AssignResponse> {
    return this.http.post<AssignResponse>(`${this.url}/assign`, payload);
  }
}
