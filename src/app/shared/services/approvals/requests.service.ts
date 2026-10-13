/**
 * Approvals' HTTP service — thin wrappers around /api/v2/approvals/requests. Viewing needs
 * the 'approvals' grant; Approve / Reject need 'approvals-action' plus the row's own module
 * grant (enforced server-side) and carry the Idempotency-Key made when the confirm opened.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { idempotencyHeaders } from 'src/app/shared/utils/idempotency.util';
import {
  ApprovalActionResponse, ApprovalDecision, ApprovalFilters, ApprovalListResponse
} from 'src/app/shared/models/approvals/approval-request.model';

@Injectable({ providedIn: 'root' })
export class ApprovalRequestsService {
  private url = `${environment.API_URL}/api/v2/approvals/requests`;

  constructor(private http: HttpClient) {}

  getRequests(adminId: string, filters: ApprovalFilters): Observable<ApprovalListResponse> {
    const params: Record<string, string> = { adminId };
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) params[key] = String(value);
    });
    return this.http.get<ApprovalListResponse>(this.url, { params });
  }

  decide(adminId: string, type: string, id: string, decision: ApprovalDecision, key?: string): Observable<ApprovalActionResponse> {
    return this.http.put<ApprovalActionResponse>(`${this.url}/${type}/${id}/${decision}`, { adminId }, { headers: idempotencyHeaders(key) });
  }
}
