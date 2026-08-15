import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, RouterStateSnapshot, Router, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { SalesAuthService } from '../services/auth/sales-auth.service';

@Injectable({
  providedIn: 'root'
})
export class SalesAuthGuard implements CanActivate {
  constructor(private salesAuthService: SalesAuthService, private router: Router) {}
  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
      const isAccessToken = this.salesAuthService.getAccessToken()?.accessToken;
      if (isAccessToken) {
        return true
      }
      return this.router.navigate(["/"]);
    }
}
