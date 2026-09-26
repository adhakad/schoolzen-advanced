/**
 * The Class Promotion page's HTTP service — thin wrappers around /api/v2/student/promotion.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  PromotionConfirmResponse, PromotionPreview, PromotionRequest, PromotionRoster
} from 'src/app/shared/models/student/class-promotion.model';
import { toParams } from './manage-students.service';

@Injectable({ providedIn: 'root' })
export class ClassPromotionService {
  private url = `${environment.API_URL}/api/v2/student/promotion`;

  constructor(private http: HttpClient) {}

  /** One class's students for the session, plus every Promote To option. */
  getRoster(
    adminId: string,
    query: { session: string; classId: string; streamId?: string; groupId?: string; sectionId?: string }
  ): Observable<PromotionRoster> {
    return this.http.get<PromotionRoster>(`${this.url}/roster`, { params: toParams(adminId, query) });
  }

  /** Counts plus the non-blocking warnings the confirm modal shows. Writes nothing. */
  preview(payload: PromotionRequest): Observable<PromotionPreview> {
    return this.http.post<PromotionPreview>(`${this.url}/preview`, payload);
  }

  /** Enqueues the promotion (202 + jobId); it is never processed inside the request. */
  confirm(payload: PromotionRequest): Observable<PromotionConfirmResponse> {
    return this.http.post<PromotionConfirmResponse>(`${this.url}/confirm`, payload);
  }
}
