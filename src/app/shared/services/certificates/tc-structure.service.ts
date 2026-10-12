/**
 * TC Structure's HTTP service — /api/v2/certificates/tc-structure. Saving needs the explicit
 * 'tc-structure' grant (enforced by the API).
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { TcStructureView } from 'src/app/shared/models/certificates/certificates.model';

@Injectable({ providedIn: 'root' })
export class TcStructureService {
  private url = `${environment.API_URL}/api/v2/certificates/tc-structure`;

  constructor(private http: HttpClient) {}

  get(adminId: string, session: string): Observable<TcStructureView> {
    return this.http.get<TcStructureView>(this.url, { params: { adminId, session } });
  }

  save(adminId: string, session: string, nextSerialNumber: string, expectedSerialNumber: string):
    Observable<TcStructureView & { message: string }> {
    return this.http.put<TcStructureView & { message: string }>(this.url,
      { adminId, session, nextSerialNumber, expectedSerialNumber });
  }
}
