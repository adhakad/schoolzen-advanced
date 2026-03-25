import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ClassSubject } from '../modal/class-subject.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ClassSubjectService {
  url = `${environment.API_URL}/v1/class-subject`;
  constructor(private http:HttpClient) { }

  addClassSubject(classSubjectData:ClassSubject){
    return this.http.post(this.url,classSubjectData);
  }
  // getClassSubjectList() {
  //   return this.http.get<ClassSubject[]>(this.url);
  // }
  
  getSingleClassSubjectByStream(params:any) {
    return this.http.get(`${this.url}/admin/${params.adminId}/subject/${params.cls}/stream/${params.stream}`);
  }
  getClassSubjectCount() {
    return this.http.get(`${this.url}/class-subject-count`);
  }
  // getSubjectByClass(cls:any) {
  //   return this.http.get<ClassSubject[]>(`${this.url}/subject/${cls}`);
  // }
  classSubjectPaginationList(classSubjectData:any){
    return this.http.post(`${this.url}/classSubject-pagination`,classSubjectData);
  }
  updateClassSubject(classSubjectData:ClassSubject){
    return this.http.put(`${this.url}/${classSubjectData._id}`, classSubjectData);
  }
  deleteClassSubject(id:String){
    return this.http.delete(`${this.url}/${id}`);
  }
}
