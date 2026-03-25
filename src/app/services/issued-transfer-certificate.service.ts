import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Student } from '../modal/student.modal';
import { environment } from 'src/environments/environment';


@Injectable({
  providedIn: 'root'
})
export class IssuedTransferCertificateService {
  url = `${environment.API_URL}/v1/issued-transfer-certificate`;
  constructor(private http:HttpClient) { }

  createTransferCertificate(studentData:any){
    return this.http.post(this.url,studentData);
  }
  getIssuedTransferCertificateCount(params:any) {
    return this.http.get(`${this.url}/issued-transfer-certificate-count/${params.adminId}`);
  }
  issuedTransferCertificatePagination(studentData:any){
    return this.http.post(`${this.url}/issued-transfer-certificate-pagination`,studentData);
  }
  deleteIssuedTransferCertificate(id:String){
    return this.http.delete(`${this.url}/${id}`);
  }
}
