/**
 * The Classes & Sections page's HTTP service — thin wrappers around the
 * /api/v2/academic-setup class routes.
 *
 * Lives under shared/services/<module>/, not inside the academic-setup component folder:
 * services, models and pipes sit in top-level LAYER folders with a module subfolder
 * inside each, mirroring the backend's controllers/ models/ routes/ exactly
 * (docs/schoolzen-planning/v1/_core/frontend-backend-folder-structure.md). Subjects and
 * Subject Groups get their own sibling files here rather than joining this one.
 *
 * `/api/v2`, not `/v1`: every v2 route sits under its own base path
 * (frontend-backend-folder-structure.md) standing alongside the legacy ones, so a v1
 * route can never be shadowed. The legacy /v1/class endpoints are untouched and still
 * serving the old admin pages.
 *
 * No error handling here. The shared ErrorInterceptor shapes and surfaces everything
 * except ValidationError, which the page binds to its own fields.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  AcademicClass, ClassNameOption, ClassPayload
} from 'src/app/shared/models/academic-setup/class.model';

@Injectable({ providedIn: 'root' })
export class ClassesSectionsService {
  private url = `${environment.API_URL}/api/v2/academic-setup`;

  constructor(private http: HttpClient) {}

  /**
   * The page's single read: every class, each already carrying its student counts.
   *
   * `session` narrows those counts to one academic session. The class/stream/section
   * structure itself is session-independent — a school runs 11th Science whichever year
   * it is — so only the head-counts move when the header's session selector changes.
   */
  getClasses(adminId: string, session?: string): Observable<AcademicClass[]> {
    const params: Record<string, string> = { adminId };
    if (session) params['session'] = session;
    return this.http.get<AcademicClass[]>(`${this.url}/classes`, { params });
  }

  /** Standard class names minus the ones this school has already configured. */
  getClassNameOptions(adminId: string): Observable<ClassNameOption[]> {
    return this.http.get<ClassNameOption[]>(`${this.url}/class-options`, { params: { adminId } });
  }

  createClass(payload: ClassPayload): Observable<unknown> {
    return this.http.post(`${this.url}/classes`, payload);
  }

  updateClass(id: string, payload: ClassPayload): Observable<unknown> {
    return this.http.put(`${this.url}/classes/${id}`, payload);
  }

  /**
   * `confirmed` travels as a query param rather than a body: a DELETE body is awkward
   * through HttpClient, and the scope middleware reads adminId off the query anyway.
   * The server refuses to delete a class that has students without it — the UI's
   * type-to-confirm is the first gate, this is the backstop behind it.
   */
  deleteClass(id: string, adminId: string, confirmed: boolean): Observable<unknown> {
    return this.http.delete(`${this.url}/classes/${id}`, {
      params: { adminId, confirmed: String(confirmed) }
    });
  }

  /**
   * "Delete Selected" — the whole selection in one request, never a delete call per checked
   * row. POST rather than DELETE because the selection is a body.
   */
  bulkDelete(adminId: string, ids: string[], confirmed: boolean): Observable<unknown> {
    return this.http.post(`${this.url}/classes/bulk-delete`, { adminId, ids, confirmed });
  }
}
