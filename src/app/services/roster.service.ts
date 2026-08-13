import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class RosterService {
  url = `${environment.API_URL}/v1/roster`;
  constructor(private http: HttpClient) { }

  getRosterMonth(params: any) {
    return this.http.post(`${this.url}/roster-month`, params);
  }
  addRoster(rosterData: any) {
    return this.http.post(this.url, rosterData);
  }
  updateRoster(rosterData: any) {
    return this.http.put(`${this.url}/${rosterData._id}`, rosterData);
  }
  deleteRoster(id: String) {
    return this.http.delete(`${this.url}/${id}`);
  }
  bulkAssignRoster(params: any) {
    return this.http.post(`${this.url}/bulk-assign`, params);
  }
  bulkClearRoster(params: any) {
    return this.http.post(`${this.url}/bulk-clear`, params);
  }
  getExpectedShift(params: any) {
    return this.http.get(`${this.url}/expected-shift/${params.adminId}/${params.personType}/${params.personId}/${params.date}`);
  }
}
