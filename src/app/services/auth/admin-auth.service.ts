import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Router } from "@angular/router";
import { Subject } from "rxjs";
import { CookieService } from "ngx-cookie-service";
import { AdminLoginData } from "src/app/modal/admin.model";
import { environment } from "src/environments/environment";


@Injectable({
  providedIn: 'root'
})
export class AdminAuthService {
  url = `${environment.API_URL}/v1/admin`;
  private isAdminAuthenticated = false;
  private token: string | null = '';
  private tokenTimer: any;
  payload: any;
  private authStatusListener = new Subject<boolean>();
  constructor(private http: HttpClient, private router: Router, private cookieService: CookieService) { }


  getToken() {
    return this.token;
  }

  getIsAuth() {
    return this.isAdminAuthenticated;
  }

  getAuthStatusListener() {
    return this.authStatusListener.asObservable();
  }

  login(adminLoginData: AdminLoginData) {
    return this.http.post(`${this.url}/login`, adminLoginData);
  }

  signup(adminSignupData: any) {
    return this.http.post(`${this.url}/signup`, adminSignupData);
  }

  forgotPassword(adminForgotData: any) {
    return this.http.post(`${this.url}/forgot-password`, adminForgotData);
  }

  varifyOTP(adminOtpData: any) {
    return this.http.post(`${this.url}/varify-otp`, adminOtpData);
  }

  adminVarify(adminLoginData: any) {
    return this.http.post(`${this.url}/varify-admin`, adminLoginData);
  }
  passwordReset(adminLoginData: any) {
    return this.http.post(`${this.url}/reset-password`, adminLoginData);
  }

  storeAccessToken(accessToken: string) {
    this.token = accessToken;
    if (accessToken) {
      const now = new Date();
      const decodedToken = JSON.parse(atob(accessToken.split('.')[1]));
      const accessTokenExpDate = new Date(decodedToken.exp * 1000);
      const accessTokenExpIn = Math.floor((accessTokenExpDate.getTime() - now.getTime()) / 1000) + 1;

      if (!this.getAccessToken()?.accessToken) {
        const base64 = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        this.cookieService.set("adminAccessToken", accessToken, accessTokenExpDate, '/');
        this.cookieService.set("_uD", base64, accessTokenExpDate, '/');
        this.setAuthTimer(accessTokenExpIn);
        this.isAdminAuthenticated = true;
        this.authStatusListener.next(true);
        this.router.navigate(["/admin/dashboard"], { replaceUrl: true });
      }
    }
  }

  storeRefreshToken(refreshToken: string) {
    if (refreshToken) {
      const decodedToken = JSON.parse(atob(refreshToken.split('.')[1]));
      const refreshTokenExpDate = new Date(decodedToken.exp * 1000);
      this.cookieService.set("adminRefreshToken", refreshToken, refreshTokenExpDate, '/');
    }
  }

  autoAuthAdmin() {
    const authInfo = this.getAccessToken();
    if (!authInfo) return;
    const now = new Date();
    const accessTokenExpIn = authInfo.accessTokenExpDate.getTime() - now.getTime();
    if (accessTokenExpIn > 0) {
      this.token = authInfo.accessToken;
      this.isAdminAuthenticated = true;
      this.setAuthTimer(accessTokenExpIn / 1000);
      this.authStatusListener.next(true);
    }
  }

  private setAuthTimer(duration: number) {
    this.tokenTimer = setTimeout(() => {
      this.logout();
    }, duration * 1000);
  }

  logout() {
    this.token = null;
    this.isAdminAuthenticated = false;
    this.authStatusListener.next(false);

    if (this.tokenTimer) {
      clearTimeout(this.tokenTimer);
    }

    this.deleteAllCookies();

    setTimeout(() => {
      this.router.navigate(["/"], { replaceUrl: true });
    }, 100); // Ensures cookies are cleared before redirection
  }

  getAccessToken() {
    const accessToken = this.cookieService.get("adminAccessToken");
    if (!accessToken) return;

    const decodedToken = JSON.parse(atob(accessToken.split('.')[1]));
    const accessTokenExpDate = new Date(decodedToken.exp * 1000);

    return {
      accessToken,
      accessTokenExpDate
    };
  }

  getRefreshToken() {
    const refreshToken = this.cookieService.get("adminRefreshToken");
    if (!refreshToken) return;

    const decodedToken = JSON.parse(atob(refreshToken.split('.')[1]));
    const refreshTokenExpDate = new Date(decodedToken.exp * 1000);

    return {
      refreshToken,
      refreshTokenExpDate
    };
  }

  getLoggedInAdminInfo() {
    const token = this.getAccessToken()?.accessToken;
    if (!token) return;

    return this.getLoggedInAdmin(token);
  }

  private getLoggedInAdmin(token: string) {
    let userDetail = this.cookieService.get("_uD");

    if (token && !userDetail) {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const decodedToken = JSON.parse(atob(token.split('.')[1]));
      const expDate = new Date(decodedToken.exp * 1000);
      this.cookieService.set("_uD", base64, expDate, '/');

      const payloadJson = decodeURIComponent(window.atob(base64).split('').map(c =>
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      ).join(''));
      return JSON.parse(payloadJson).payload;
    }

    const payloadJson = decodeURIComponent(window.atob(userDetail).split('').map(c =>
      '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    ).join(''));
    return JSON.parse(payloadJson).payload;
  }

  deleteAllCookies() {
    this.cookieService.delete("adminAccessToken", '/');
    this.cookieService.delete("adminRefreshToken", '/');
    this.cookieService.delete("_uD", '/');
    this.cookieService.delete("_vN", '/');
  }
}

