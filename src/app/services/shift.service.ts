import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Shift } from '../modal/shift.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ShiftService {
  url = `${environment.API_URL}/v1/shift`;
  constructor(private http: HttpClient) { }

  addShift(shiftData: Shift) {
    return this.http.post(this.url, shiftData);
  }
  getShiftList(adminId: any) {
    return this.http.get<Shift[]>(`${this.url}/all-shift/${adminId}`);
  }
  getShiftCount(adminId: any) {
    return this.http.get(`${this.url}/shift-count/${adminId}`);
  }
  shiftPaginationList(shiftData: any) {
    return this.http.post(`${this.url}/shift-pagination`, shiftData);
  }
  updateShift(shiftData: Shift) {
    return this.http.put(`${this.url}/${shiftData._id}`, shiftData);
  }
  deleteShift(id: String) {
    return this.http.delete(`${this.url}/${id}`);
  }
}
