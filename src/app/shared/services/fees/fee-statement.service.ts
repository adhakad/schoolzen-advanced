/**
 * Fee Statement's HTTP service — one composed read per student (/api/v2/fees/statement).
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { FeeStatement } from 'src/app/shared/models/fees/fees.model';

@Injectable({ providedIn: 'root' })
export class FeeStatementService {
  private url = `${environment.API_URL}/api/v2/fees/statement`;

  constructor(private http: HttpClient) {}

  get(adminId: string, session: string, studentId: string): Observable<FeeStatement> {
    return this.http.get<FeeStatement>(`${this.url}/${studentId}`, { params: { adminId, session } });
  }
}
