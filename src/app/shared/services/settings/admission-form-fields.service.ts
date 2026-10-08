/**
 * Settings → Admission Form Fields — thin wrappers around /api/v2/settings/admission-form-fields.
 * No error handling here: ErrorInterceptor surfaces everything except inline-form errors.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  CreateFieldPayload, FieldChange, FieldConfigResponse, FieldImpact
} from 'src/app/shared/models/settings/field-config.model';
import { idempotencyHeaders } from 'src/app/shared/utils/idempotency.util';

@Injectable({ providedIn: 'root' })
export class AdmissionFormFieldsService {
  private url = `${environment.API_URL}/api/v2/settings/admission-form-fields`;

  constructor(private http: HttpClient) {}

  getFields(adminId: string): Observable<FieldConfigResponse> {
    return this.http.get<FieldConfigResponse>(this.url, { params: { adminId } });
  }

  createField(payload: CreateFieldPayload, key?: string): Observable<unknown> {
    return this.http.post(this.url, payload, { headers: idempotencyHeaders(key) });
  }

  /** The page's one "Save Changes" — every staged change in one request. */
  saveChanges(adminId: string, changes: FieldChange[]): Observable<unknown> {
    return this.http.put(this.url, { adminId, changes });
  }

  /** Live affected-record count for a pending type/options change, before it is saved. */
  getImpact(adminId: string, fieldKey: string, change: { type?: string; options?: string[] }): Observable<FieldImpact> {
    return this.http.post<FieldImpact>(`${this.url}/${encodeURIComponent(fieldKey)}/impact`, { adminId, ...change });
  }

  deleteField(adminId: string, fieldKey: string): Observable<unknown> {
    return this.http.delete(`${this.url}/${encodeURIComponent(fieldKey)}`, { params: { adminId, confirm: 'DELETE' } });
  }
}
