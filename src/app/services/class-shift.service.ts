import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { ClassShift } from '../modal/class-shift.model';

@Injectable({
  providedIn: 'root'
})
export class ClassShiftService {
  url = `${environment.API_URL}/v1/class-shift`;
  constructor(private http: HttpClient) { }

  // The classes this school actually runs, from its own student records — not the global
  // /v1/class list, which is the same 15 rows for every school.
  getClassOptions(adminId: any) {
    return this.http.get<String[]>(`${this.url}/classes/${adminId}`);
  }
  getClassShiftList(adminId: any) {
    return this.http.get<ClassShift[]>(`${this.url}/${adminId}`);
  }
  // data: { adminId, shiftId, classes: [] }
  bulkAssignClassShift(data: any) {
    return this.http.post(`${this.url}/bulk-assign`, data);
  }
  deleteClassShift(id: String) {
    return this.http.delete(`${this.url}/${id}`);
  }
}
