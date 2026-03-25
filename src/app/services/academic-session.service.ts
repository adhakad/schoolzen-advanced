import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AcademicSessionService {

  url = `${environment.API_URL}/v1/academic-session`;
  constructor(private http:HttpClient) { }

  getAcademicSession() {
    return this.http.get(this.url);
  }
}
