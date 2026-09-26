/**
 * The Manage Students page's HTTP service — thin wrappers around /api/v2/student.
 *
 * Lives under shared/services/<module>/, never beside the component
 * (frontend-backend-folder-structure.md). No error handling here: the shared
 * ErrorInterceptor surfaces everything except ValidationError, which the page binds to its
 * own fields.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  MessageResponse, QueuedResponse, StudentDetail, StudentListResponse
} from 'src/app/shared/models/student/student.model';
import {
  AssignCardsPayload, ListQuery, ManageStudentsOverview
} from 'src/app/shared/models/student/manage-students.model';

/** Drops empty values so the query string carries only real filters. */
export const toParams = (adminId: string, query: object): Record<string, string> => {
  const params: Record<string, string> = { adminId };
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params[key] = String(value);
  });
  return params;
};

@Injectable({ providedIn: 'root' })
export class ManageStudentsService {
  private url = `${environment.API_URL}/api/v2/student`;

  constructor(private http: HttpClient) {}

  /** One keyset page. Filters only narrow — with none set this is every student. */
  getStudents(adminId: string, query: ListQuery): Observable<StudentListResponse> {
    return this.http.get<StudentListResponse>(`${this.url}/students`, { params: toParams(adminId, query) });
  }

  getOverview(adminId: string, session: string): Observable<ManageStudentsOverview> {
    return this.http.get<ManageStudentsOverview>(`${this.url}/students/overview`, { params: { adminId, session } });
  }

  getStudent(adminId: string, id: string, session: string): Observable<StudentDetail> {
    return this.http.get<StudentDetail>(`${this.url}/students/${id}`, { params: { adminId, session } });
  }

  /** Multipart: the form (plus an optional `photo` file) as FormData. */
  createStudent(form: FormData): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${this.url}/students`, form);
  }

  updateStudent(id: string, form: FormData): Observable<MessageResponse> {
    return this.http.put<MessageResponse>(`${this.url}/students/${id}`, form);
  }

  /** Every delete (one row or a selection) goes through here, after the type-DELETE confirm. */
  bulkDelete(adminId: string, ids: string[]): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${this.url}/students/bulk-delete`, { adminId, ids, confirmed: true });
  }

  /** Saves the cards; a background job pushes them to the devices (202 + jobId). */
  assignCards(payload: AssignCardsPayload): Observable<QueuedResponse> {
    return this.http.post<QueuedResponse>(`${this.url}/students/cards`, payload);
  }

  resyncCard(adminId: string, id: string): Observable<QueuedResponse> {
    return this.http.post<QueuedResponse>(`${this.url}/students/${id}/card-resync`, { adminId });
  }

  /** Class (+stream) is REQUIRED here — the one scope-gated action on this page. */
  exportExcel(adminId: string, scope: { session: string; classId: string; streamId?: string }): Observable<Blob> {
    return this.http.get(`${this.url}/students/excel/export`, {
      params: toParams(adminId, scope),
      responseType: 'blob'
    });
  }

  importExcel(form: FormData): Observable<QueuedResponse> {
    return this.http.post<QueuedResponse>(`${this.url}/students/excel/import`, form);
  }
}
