import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ExamResultService {
  url = `${environment.API_URL}/v1/exam-result`;
  constructor(private http: HttpClient) { }


  geteExamResultCount(params:any) {
    return this.http.get(`${this.url}/exam-result-count/${params.adminId}`);
  }
  addExamResult(userForm:any) {
    // console.log(userForm);
    return this.http.post(`${this.url}`,userForm);
  }
  addBulkExamResult(examBulkResult:any) {
    return this.http.post(`${this.url}/bulk-exam-result`,examBulkResult);
  }
  singleStudentExamResult(examResultFormData: any) {
    return this.http.post(`${this.url}/result`,examResultFormData);
  }
  singleStudentExamResultById(studentId: any) {
    return this.http.get(`${this.url}/student/${studentId}`);
  }
  getAllStudentExamResultByClassStream(params:any){
    return this.http.get(`${this.url}/admin/${params.adminId}/result/class/${params.class}/stream/${params.stream}`);
  }
  getAllStudentExamResultByClass(params:any){
    return this.http.get(`${this.url}/admin/${params.adminId}/class/${params.class}/stream/${params.stream}`);
  }
  updateExamResult(examForm:any){
    return this.http.put(`${this.url}`,examForm);
  }
  resultsByClass(cls: any) {
    return this.http.get(`${this.url}/student-results/${cls}`);
  }
  // deleteExamResult(id:any){
  //   return this.http.delete(`${this.url}/${id}`);
  // }
  deleteMarksheetResult(id:any){
    return this.http.delete(`${this.url}/${id}`);
  }
  
}