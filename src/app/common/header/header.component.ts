import { Component, OnInit, OnDestroy, } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from "rxjs";
import { AdminAuthService } from "src/app/services/auth/admin-auth.service";
import { TeacherAuthService } from "src/app/services/auth/teacher-auth.service";
import { environment } from "src/environments/environment";
import { ClassService } from "src/app/services/class.service";
import { CookieService } from "ngx-cookie-service";


@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
})
export class HeaderComponent implements OnInit, OnDestroy {
  nav: boolean = false;
  panelOpenState: boolean = false
  softwareCompanyLink:string='https://schooliya.in';
  token: string = '';
  isAdminAuthenticated = false;
  isTeacherAuthenticated = false;
  private authListenerSubs: Subscription | undefined;

  enteredButton = false;
  isMatMenuOpen = false;
  isMatMenu2Open = false;
  prevButtonTrigger: any;
  modulesList: any;
  
  constructor( private adminAuthService: AdminAuthService, private teacherAuthService: TeacherAuthService) {}



  ngOnInit() {
    this.adminAuthService.autoAuthAdmin();
    this.isAdminAuthenticated = this.adminAuthService.getIsAuth();
    this.authListenerSubs = this.adminAuthService
      .getAuthStatusListener()
      .subscribe(isAdminAuthenticated => {
        this.isAdminAuthenticated = isAdminAuthenticated;
      });

    this.teacherAuthService.autoAuthTeacher();
    this.isTeacherAuthenticated = this.teacherAuthService.getIsAuth();
    this.authListenerSubs = this.teacherAuthService
      .getAuthStatusListener()
      .subscribe(isTeacherAuthenticated => {
        this.isTeacherAuthenticated = isTeacherAuthenticated;
      });
  }
  hamburgerMenu(isNavOpen: boolean): void {
    this.nav = !isNavOpen;
  }
  softwareCompany(link:string){
    const sanitizedLink = encodeURI(link);
    window.location.href = sanitizedLink;
  }
  
  ngOnDestroy() {
    this.authListenerSubs?.unsubscribe();
  }

}
