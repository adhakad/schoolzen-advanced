import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SalaryStructure } from '../modal/salary-structure.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SalaryStructureService {
  url = `${environment.API_URL}/v1/salary-structure`;
  constructor(private http: HttpClient) { }

  // The Assign Salary table. Returns STAFF rows with their assignment attached — including
  // the unassigned ones, who are the reason the page exists.
  assignSalaryPaginationList(data: any) {
    return this.http.post(`${this.url}/assign-salary-pagination`, data);
  }
  // Keyed by staffId, not the structure id: the form knows who it is editing, not whether
  // that person has a row yet. Resolves to null for an unassigned staff member.
  getSalaryStructureByStaff(adminId: any, staffId: any) {
    return this.http.get<SalaryStructure>(`${this.url}/staff/${adminId}/${staffId}`);
  }
  assignSalary(data: SalaryStructure) {
    return this.http.post(this.url, data);
  }
  bulkAssignSalary(data: any) {
    return this.http.post(`${this.url}/bulk-assign`, data);
  }
  deleteSalaryStructure(id: String) {
    return this.http.delete(`${this.url}/${id}`);
  }
}
