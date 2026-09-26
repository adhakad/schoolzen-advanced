/**
 * The Admission page's HTTP service — thin wrappers around /api/v2/student/admissions.
 * The form's reference data (FieldConfig, class options) comes from StudentOptionsService.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { MessageResponse, StudentListResponse } from 'src/app/shared/models/student/student.model';
import { ListQuery } from 'src/app/shared/models/student/manage-students.model';
import { AdmissionOverview } from 'src/app/shared/models/student/admission.model';
import { LetterheadDocument } from 'src/app/shared/models/letterhead.model';
import { toParams } from './manage-students.service';

@Injectable({ providedIn: 'root' })
export class AdmissionService {
  private url = `${environment.API_URL}/api/v2/student`;

  constructor(private http: HttpClient) {}

  getAdmissions(adminId: string, query: ListQuery): Observable<StudentListResponse> {
    return this.http.get<StudentListResponse>(`${this.url}/admissions`, { params: toParams(adminId, query) });
  }

  getOverview(adminId: string, session: string): Observable<AdmissionOverview> {
    return this.http.get<AdmissionOverview>(`${this.url}/admissions/overview`, { params: { adminId, session } });
  }

  createAdmission(form: FormData): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${this.url}/admissions`, form);
  }

  /** The letter's document model, built by the shared letterhead service. */
  getLetter(adminId: string, id: string): Observable<LetterheadDocument> {
    return this.http.get<LetterheadDocument>(`${this.url}/admissions/${id}/letter`, { params: { adminId } });
  }
}
