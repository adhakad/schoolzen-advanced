/**
 * Settings → School Profile — thin wrappers around /api/v2/settings/school-profile.
 * adminId goes in the query string (the PUT may be multipart when a logo is attached).
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { SchoolProfile, SchoolProfilePayload, SchoolProfileResponse } from 'src/app/shared/models/settings/school-profile.model';

@Injectable({ providedIn: 'root' })
export class SchoolProfileService {
  private url = `${environment.API_URL}/api/v2/settings/school-profile`;

  constructor(private http: HttpClient) {}

  get(adminId: string): Observable<SchoolProfileResponse> {
    return this.http.get<SchoolProfileResponse>(this.url, { params: { adminId } });
  }

  save(adminId: string, payload: SchoolProfilePayload, logo: File | null): Observable<{ message: string; profile: SchoolProfile }> {
    let body: SchoolProfilePayload | FormData = payload;
    if (logo) {
      const form = new FormData();
      Object.entries(payload).forEach(([key, value]) => form.append(key, value == null ? '' : String(value)));
      form.append('logo', logo);
      body = form;
    }
    return this.http.put<{ message: string; profile: SchoolProfile }>(this.url, body, { params: { adminId } });
  }
}
