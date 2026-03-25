import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class MessageWalletService {
  url = `${environment.API_URL}/v1/whatsapp-message`;
  constructor(private http: HttpClient) { }


  getRemainingWhatsappMessageCount(params: any) {
    return this.http.get(`${this.url}/remaining-whatsapp-message-count/${params.adminId}`);
  }

}