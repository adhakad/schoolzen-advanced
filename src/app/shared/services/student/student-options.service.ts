/**
 * Read-only reference data every Student page and the shared student components need:
 * the cascade filter's classes/streams/sections/groups, and the FieldConfig the student
 * form renders from. Both come from ONE backend call each (never Academic Setup's separate
 * endpoints stitched together in the browser), cached per school because they change
 * rarely — `refresh()` drops the cache after a known change.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { FieldConfigResponse, StudentFilterOptions } from 'src/app/shared/models/student/student.model';

@Injectable({ providedIn: 'root' })
export class StudentOptionsService {
  private url = `${environment.API_URL}/api/v2/student`;
  private filterCache = new Map<string, Observable<StudentFilterOptions>>();
  private fieldCache = new Map<string, Observable<FieldConfigResponse>>();

  constructor(private http: HttpClient) {}

  getFilterOptions(adminId: string): Observable<StudentFilterOptions> {
    if (!this.filterCache.has(adminId)) {
      this.filterCache.set(adminId, this.http
        .get<StudentFilterOptions>(`${this.url}/filter-options`, { params: { adminId } })
        .pipe(shareReplay({ bufferSize: 1, refCount: false })));
    }
    return this.filterCache.get(adminId) as Observable<StudentFilterOptions>;
  }

  getFieldConfig(adminId: string): Observable<FieldConfigResponse> {
    if (!this.fieldCache.has(adminId)) {
      this.fieldCache.set(adminId, this.http
        .get<FieldConfigResponse>(`${this.url}/field-config`, { params: { adminId } })
        .pipe(shareReplay({ bufferSize: 1, refCount: false })));
    }
    return this.fieldCache.get(adminId) as Observable<FieldConfigResponse>;
  }

  refresh(): void {
    this.filterCache.clear();
    this.fieldCache.clear();
  }
}
