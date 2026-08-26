import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SalaryGroup } from '../modal/salary-group.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SalaryGroupService {
  url = `${environment.API_URL}/v1/salary-group`;
  constructor(private http: HttpClient) { }

  addSalaryGroup(salaryGroupData: SalaryGroup) {
    return this.http.post(this.url, salaryGroupData);
  }
  getSalaryGroupList(adminId: any) {
    return this.http.get<SalaryGroup[]>(`${this.url}/all-salary-group/${adminId}`);
  }
  // Only ACTIVE groups — what the Assign Salary picker reads. The full list above is the
  // settings table, and includes retired groups so their history still reads.
  getActiveSalaryGroupList(adminId: any) {
    return this.http.get<SalaryGroup[]>(`${this.url}/active-salary-group/${adminId}`);
  }
  getSalaryGroupCount(adminId: any) {
    return this.http.get(`${this.url}/salary-group-count/${adminId}`);
  }
  salaryGroupPaginationList(salaryGroupData: any) {
    return this.http.post(`${this.url}/salary-group-pagination`, salaryGroupData);
  }
  updateSalaryGroup(salaryGroupData: SalaryGroup) {
    return this.http.put(`${this.url}/${salaryGroupData._id}`, salaryGroupData);
  }
  deleteSalaryGroup(id: String) {
    return this.http.delete(`${this.url}/${id}`);
  }
}
