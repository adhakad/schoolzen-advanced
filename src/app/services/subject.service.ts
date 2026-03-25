import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject } from '../modal/subject.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SubjectService {
  url = `${environment.API_URL}/v1/subject`;
  constructor(private http: HttpClient) { }

  addSubject(subjectData: Subject) {
    return this.http.post(this.url, subjectData);
  }
  getSubjectList(adminId:any) {
    return this.http.get<Subject[]>(`${this.url}/all-subject/${adminId}`);
  }
  getSubjectCount() {
    return this.http.get(`${this.url}/subject-count`);
  }
  subjectPaginationList(subjectData: any) {
    return this.http.post(`${this.url}/subject-pagination`, subjectData);
  }
  updateSubject(subjectData: Subject) {
    return this.http.put(`${this.url}/${subjectData._id}`, subjectData);
  }
  deleteSubject(id: String) {
    return this.http.delete(`${this.url}/${id}`);
  }
}
