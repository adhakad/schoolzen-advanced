/** Templates' HTTP service — thin wrappers around /api/v2/holiday/templates. */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  HolidayTemplate, HolidayTemplateListResponse, HolidayTemplateOption, HolidayTemplatePayload
} from 'src/app/shared/models/holiday/holiday-template.model';

@Injectable({ providedIn: 'root' })
export class HolidayTemplatesService {
  private url = `${environment.API_URL}/api/v2/holiday/templates`;

  constructor(private http: HttpClient) {}

  getTemplates(adminId: string, options: { search?: string; page?: number; limit?: number } = {}): Observable<HolidayTemplateListResponse> {
    const params: Record<string, string> = { adminId };
    if (options.search) params['search'] = options.search;
    if (options.page) params['page'] = String(options.page);
    if (options.limit) params['limit'] = String(options.limit);
    return this.http.get<HolidayTemplateListResponse>(this.url, { params });
  }

  getOptions(adminId: string): Observable<{ rows: HolidayTemplateOption[] }> {
    return this.http.get<{ rows: HolidayTemplateOption[] }>(`${this.url}/options`, { params: { adminId } });
  }

  createTemplate(payload: HolidayTemplatePayload): Observable<{ message: string; template: HolidayTemplate }> {
    return this.http.post<{ message: string; template: HolidayTemplate }>(this.url, payload);
  }

  updateTemplate(id: string, payload: HolidayTemplatePayload): Observable<{ message: string; template: HolidayTemplate }> {
    return this.http.put<{ message: string; template: HolidayTemplate }>(`${this.url}/${id}`, payload);
  }

  deleteTemplate(adminId: string, id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.url}/${id}`, { params: { adminId } });
  }
}
