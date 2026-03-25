import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class BoardService {

  url = `${environment.API_URL}/v1/board`;
  constructor(private http: HttpClient) { }
  getBoardList() {
    return this.http.get<any>(this.url);
  }
}