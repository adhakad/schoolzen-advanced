/**
 * The Subjects page's HTTP service — thin wrappers around the /api/v2/academic-setup
 * subject routes.
 *
 * Lives under shared/services/<module>/, not inside the academic-setup component folder:
 * services, models and pipes sit in top-level LAYER folders with a module subfolder inside
 * each, mirroring the backend's controllers/ models/ routes/ exactly
 * (docs/schoolzen-planning/v1/_core/frontend-backend-folder-structure.md).
 *
 * No error handling here. The shared ErrorInterceptor shapes and surfaces everything except
 * ValidationError, which the page binds to its own fields.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  SubjectListResponse, SubjectPayload
} from 'src/app/shared/models/academic-setup/subject.model';
import { BulkDeleteResponse } from 'src/app/shared/models/academic-setup/bulk-delete.model';
import { idempotencyHeaders } from 'src/app/shared/utils/idempotency.util';

@Injectable({ providedIn: 'root' })
export class SubjectsService {
  private url = `${environment.API_URL}/api/v2/academic-setup`;

  constructor(private http: HttpClient) {}

  /**
   * The page's single read: one page of rows, the total behind the current search, and the
   * side card's counts — all from one aggregation, never two requests stitched together.
   */
  getSubjects(
    adminId: string,
    options: { search?: string; page?: number; limit?: number } = {}
  ): Observable<SubjectListResponse> {
    const params: Record<string, string> = { adminId };
    if (options.search) params['search'] = options.search;
    if (options.page) params['page'] = String(options.page);
    if (options.limit) params['limit'] = String(options.limit);
    return this.http.get<SubjectListResponse>(`${this.url}/subjects`, { params });
  }

  /**
   * `key` is the Idempotency-Key the page made when the modal opened
   * (utils/idempotency.util.ts): a retry or double click of the same submission replays the
   * first result instead of writing twice.
   */
  createSubject(payload: SubjectPayload, key?: string): Observable<unknown> {
    return this.http.post(`${this.url}/subjects`, payload, { headers: idempotencyHeaders(key) });
  }

  updateSubject(id: string, payload: SubjectPayload, key?: string): Observable<unknown> {
    return this.http.put(`${this.url}/subjects/${id}`, payload, { headers: idempotencyHeaders(key) });
  }

  /**
   * The whole selection in one request — never a delete call per checked row.
   *
   * POST rather than DELETE because the selection is a body; `confirmed` is what the
   * server requires before removing a subject that Subject Groups still reference. The
   * UI's type-to-DELETE gate is the first check, this is the backstop behind it.
   */
  bulkDelete(adminId: string, ids: string[], confirmed: boolean): Observable<BulkDeleteResponse> {
    return this.http.post<BulkDeleteResponse>(`${this.url}/subjects/bulk-delete`, { adminId, ids, confirmed });
  }
}
