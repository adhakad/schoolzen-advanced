import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  url = `${environment.API_URL}/v1/payment`;
  constructor(private http: HttpClient) {}

  createPayment(paymentData: any) {
    console.log(paymentData)
    return this.http.post(`${this.url}/create`, paymentData);
  }
  validatePayment(paymentData: any) {
    return this.http.post(`${this.url}/validate`, paymentData);
  }
  validateUpgradePayment(paymentData: any) {
    return this.http.post(`${this.url}/validate-upgrade-plan`, paymentData);
  }
}
