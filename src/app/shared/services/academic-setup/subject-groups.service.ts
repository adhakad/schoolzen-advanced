/**
 * The Subject Groups page's HTTP service — thin wrappers around the
 * /api/v2/academic-setup subject-group routes.
 *
 * Lives under shared/services/<module>/, beside its Classes & Sections and Subjects
 * siblings rather than joining either of them: one service per PAGE
 * (docs/schoolzen-planning/v1/_core/frontend-backend-folder-structure.md).
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  SubjectGroupFormOptions, SubjectGroupListResponse, SubjectGroupPayload
} from 'src/app/shared/models/academic-setup/subject-group.model';

@Injectable({ providedIn: 'root' })
export class SubjectGroupsService {
  private url = `${environment.API_URL}/api/v2/academic-setup`;

  constructor(private http: HttpClient) {}

  /**
   * The page's list read. Class names, stream names and subject tags are resolved in the
   * SAME backend aggregation as the rows — this page never fetches classes and subjects
   * separately and joins them in the browser.
   */
  getSubjectGroups(
    adminId: string,
    options: { classId?: string; streamId?: string; search?: string; page?: number; limit?: number } = {}
  ): Observable<SubjectGroupListResponse> {
    const params: Record<string, string> = { adminId };
    if (options.classId) params['classId'] = options.classId;
    if (options.streamId) params['streamId'] = options.streamId;
    if (options.search) params['search'] = options.search;
    if (options.page) params['page'] = String(options.page);
    if (options.limit) params['limit'] = String(options.limit);
    return this.http.get<SubjectGroupListResponse>(`${this.url}/subject-groups`, { params });
  }

  /**
   * The toolbar's Class/Stream filters AND the modal's class/stream/subject inputs, in one
   * call. Re-fetched when the modal opens, so the subject checklist always reflects the
   * current Subjects list rather than a copy taken when the page loaded.
   */
  getFormOptions(adminId: string): Observable<SubjectGroupFormOptions> {
    return this.http.get<SubjectGroupFormOptions>(
      `${this.url}/subject-groups/form-options`,
      { params: { adminId } }
    );
  }

  createSubjectGroup(payload: SubjectGroupPayload): Observable<unknown> {
    return this.http.post(`${this.url}/subject-groups`, payload);
  }

  updateSubjectGroup(id: string, payload: SubjectGroupPayload): Observable<unknown> {
    return this.http.put(`${this.url}/subject-groups/${id}`, payload);
  }

  bulkDelete(adminId: string, ids: string[], confirmed: boolean): Observable<unknown> {
    return this.http.post(`${this.url}/subject-groups/bulk-delete`, { adminId, ids, confirmed });
  }
}
