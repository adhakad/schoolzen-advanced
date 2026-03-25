import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, RouterStateSnapshot, Router, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { TeacherAuthService } from '../services/auth/teacher-auth.service';

@Injectable({
  providedIn: 'root'
})
export class TeacherAuthGuard implements CanActivate {
  constructor(private teacherAuthService: TeacherAuthService, private router: Router) {}
  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
      const isAccessToken = this.teacherAuthService.getAccessToken()?.accessToken;
      if (isAccessToken) {
        return true
      } 
      return this.router.navigate(["/"]);
    }  
}
