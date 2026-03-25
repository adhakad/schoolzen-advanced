import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from "src/environments/environment";
@Injectable({
  providedIn: 'root'
})
export class AdmitCardService {
  url = `${environment.API_URL}/v1/admit-card`;
  constructor(private http: HttpClient) { }

  admitCardStudentByClass(cls: any) {
    return this.http.get(`${this.url}/${cls}`);
  }
  getAllStudentAdmitCardByClass(params:any){
    return this.http.get(`${this.url}/admin/${params.adminId}/class/${params.cls}/stream/${params.stream}`);
  }
  singleStudentAdmitCardById(id: any) {
    return this.http.get(`${this.url}/student/${id}`);
  }
  singleStudentAdmitCard(admitCardFormData: any) {
    return this.http.post(`${this.url}`,admitCardFormData);
  }
  changeStatus(params:any){
    return this.http.put(`${this.url}/status/${params.id}`,params);
  }
}
