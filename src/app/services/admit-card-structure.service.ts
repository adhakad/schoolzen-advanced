import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from "src/environments/environment";

@Injectable({
  providedIn: 'root'
})
export class AdmitCardStructureService {
  url = `${environment.API_URL}/v1/admit-card-structure`;
  constructor(private http: HttpClient) { }

  addAdmitCardStructure(formData:any) {
    return this.http.post(`${this.url}`,formData);
  }
  admitCardStructureByClass(params: any) {
    return this.http.get(`${this.url}/admin/${params.adminId}`);
  }
  admitCardStructureByClassStream(params: any) {
    return this.http.get(`${this.url}/admin/${params.adminId}/class/${params.cls}/stream/${params.stream}`);
  }
  changeAdmitCardPublishStatus(params:any){
    return this.http.put(`${this.url}/admitcard-publish-status/${params.id}`,params);
  }
  updateAdmitCardStructure(formData:any) {
    return this.http.put(`${this.url}`,formData);
  }
  deleteAdmitCardStructure(id:any){
    return this.http.delete(`${this.url}/${id}`);
  }
}

