/**
 * Marksheet Structure's HTTP service — /api/v2/examination/marksheet-structure. Setting up or
 * removing a structure needs the 'marksheet-structure' edit grant (enforced by the API).
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  MarksheetSetup, MarksheetSetupSubject, MarksheetStructureList
} from 'src/app/shared/models/examination/examination.model';

@Injectable({ providedIn: 'root' })
export class MarksheetStructureService {
  private url = `${environment.API_URL}/api/v2/examination/marksheet-structure`;

  constructor(private http: HttpClient) {}

  list(adminId: string, session: string): Observable<MarksheetStructureList> {
    return this.http.get<MarksheetStructureList>(this.url, { params: { adminId, session } });
  }

  setup(adminId: string, session: string, classId: string, streamId: string | null): Observable<MarksheetSetup> {
    return this.http.get<MarksheetSetup>(`${this.url}/setup`, { params: { adminId, session, classId, streamId: streamId || '' } });
  }

  save(adminId: string, session: string, classId: string, streamId: string | null, version: number,
       subjects: MarksheetSetupSubject[]): Observable<{ message: string; version: number }> {
    return this.http.put<{ message: string; version: number }>(this.url, { adminId, session, classId, streamId: streamId || '', version, subjects });
  }

  remove(adminId: string, session: string, classId: string, streamId: string | null, version: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(this.url, {
      params: { adminId, session, classId, streamId: streamId || '', version: String(version) }
    });
  }
}
