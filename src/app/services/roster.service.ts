import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class RosterService {
  url = `${environment.API_URL}/v1/roster`;

  constructor(private http: HttpClient) { }

  // GET — server returns flat rosterMap { "personId|YYYY-MM-DD": shiftId }
  getRosterMonth(params: any) {
    return this.http.get(`${this.url}/roster-month`, { params });
  }

  // Single cell assign — POST body: { adminId, personType, personId, shiftId, date }
  addRoster(data: any) {
    return this.http.post(this.url, data);
  }

  // Single cell clear — DELETE body: { adminId, personType, personId, date }
  deleteRoster(data: any) {
    return this.http.delete(this.url, { body: data });
  }

  bulkAssignRoster(params: any) {
    return this.http.post(`${this.url}/bulk-assign`, params);
  }

  bulkClearRoster(params: any) {
    return this.http.post(`${this.url}/bulk-clear`, params);
  }

  getExpectedShift(params: any) {
    return this.http.get(
      `${this.url}/expected-shift/${params.adminId}/${params.personType}/${params.personId}/${params.date}`
    );
  }
}