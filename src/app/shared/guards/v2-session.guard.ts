/**
 * Gate for the /v2 route group. The new shell serves both roles, so unlike
 * AdminAuthGuard/TeacherAuthGuard it lets either session through and leaves per-item
 * access to the shell's own role/permission rules (see shell-nav.config.ts).
 */
import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';

@Injectable({ providedIn: 'root' })
export class V2SessionGuard implements CanActivate {
  constructor(private shellContext: ShellContextService, private router: Router) {}

  canActivate(): boolean | UrlTree {
    if (this.shellContext.hasAnySession()) return true;
    return this.router.createUrlTree(['/admin/login']);
  }
}
