import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Department } from '../modal/department.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DepartmentService {
  url = `${environment.API_URL}/v1/department`;
  constructor(private http: HttpClient) { }

  addDepartment(departmentData: Department) {
    return this.http.post(this.url, departmentData);
  }
  getDepartmentList(adminId: any) {
    return this.http.get<Department[]>(`${this.url}/all-department/${adminId}`);
  }
  getDepartmentCount(adminId: any) {
    return this.http.get(`${this.url}/department-count/${adminId}`);
  }
  departmentPaginationList(departmentData: any) {
    return this.http.post(`${this.url}/department-pagination`, departmentData);
  }
  updateDepartment(departmentData: Department) {
    return this.http.put(`${this.url}/${departmentData._id}`, departmentData);
  }
  deleteDepartment(id: String) {
    return this.http.delete(`${this.url}/${id}`);
  }
}
