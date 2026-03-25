import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class IdCardService {
  url = `${environment.API_URL}/v1/id-card`;

  constructor(private http: HttpClient) { }

  orderIdCard(adminId: any) {
    return this.http.get<any>(`${this.url}/${adminId}`);
  }

}