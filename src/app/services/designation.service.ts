import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Designation } from '../modal/designation.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DesignationService {
  url = `${environment.API_URL}/v1/designation`;
  constructor(private http: HttpClient) { }

  addDesignation(designationData: Designation) {
    return this.http.post(this.url, designationData);
  }
  getDesignationList(adminId: any) {
    return this.http.get<Designation[]>(`${this.url}/all-designation/${adminId}`);
  }
  getDesignationCount(adminId: any) {
    return this.http.get(`${this.url}/designation-count/${adminId}`);
  }
  designationPaginationList(designationData: any) {
    return this.http.post(`${this.url}/designation-pagination`, designationData);
  }
  updateDesignation(designationData: Designation) {
    return this.http.put(`${this.url}/${designationData._id}`, designationData);
  }
  deleteDesignation(id: String) {
    return this.http.delete(`${this.url}/${id}`);
  }
}
