import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Holiday } from '../modal/holiday.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class HolidayService {
  url = `${environment.API_URL}/v1/holiday`;
  constructor(private http: HttpClient) { }

  // startDate/endDate are "YYYY-MM-DD" strings, never Date objects or ISO instants — the
  // backend validator rejects anything else, and an ISO string would shift a day for anyone
  // east of UTC.
  addHoliday(holidayData: any) {
    return this.http.post(this.url, holidayData);
  }
  // The unpaginated list the template checklist reads — a school declares a couple of dozen
  // holidays a year, so there is nothing here worth paging.
  getHolidayList(adminId: any) {
    return this.http.get<Holiday[]>(`${this.url}/all-holiday/${adminId}`);
  }
  getHolidayCount(adminId: any) {
    return this.http.get(`${this.url}/holiday-count/${adminId}`);
  }
  holidayPaginationList(holidayData: any) {
    return this.http.post(`${this.url}/holiday-pagination`, holidayData);
  }
  getSingleHoliday(id: String) {
    return this.http.get<Holiday>(`${this.url}/${id}`);
  }
  updateHoliday(holidayData: any) {
    return this.http.put(`${this.url}/${holidayData._id}`, holidayData);
  }
  // Also pulls this holiday out of every template that carries it, server-side.
  deleteHoliday(id: String) {
    return this.http.delete(`${this.url}/${id}`);
  }
}
