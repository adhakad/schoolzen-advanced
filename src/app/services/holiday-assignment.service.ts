import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BulkAssignResult, HolidayAssignmentGrid } from '../modal/holiday-assignment.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class HolidayAssignmentService {
  url = `${environment.API_URL}/v1/holiday-assignment`;
  constructor(private http: HttpClient) { }

  // params: { adminId, personType }. For 'student' the rows come back as CLASSES, not
  // people — students follow their class's holiday calendar, the same way they follow its
  // shift. No `class` param is needed or accepted.
  getHolidayAssignmentGrid(params: any) {
    return this.http.get<HolidayAssignmentGrid>(`${this.url}/grid`, { params });
  }
  // data: { adminId, templateId, persons: [{ personType, personId }] } — staff/teacher only.
  // REPLACES on re-assign, unlike the leave equivalent: a person follows exactly one holiday
  // calendar, so this is also the endpoint the Edit flow submits to.
  bulkAssignHoliday(data: any) {
    return this.http.post<BulkAssignResult>(`${this.url}/bulk-assign`, data);
  }
  // data: { adminId, templateId, classes: [] } — one row per class covers the whole cohort.
  bulkAssignClassHoliday(data: any) {
    return this.http.post<BulkAssignResult>(`${this.url}/bulk-assign-class`, data);
  }
  // Un-assign: the person keeps working, they simply follow no holiday calendar any more.
  deleteHolidayAssignment(id: String) {
    return this.http.delete(`${this.url}/${id}`);
  }
  deleteClassHolidayAssignment(id: String) {
    return this.http.delete(`${this.url}/class/${id}`);
  }
}
