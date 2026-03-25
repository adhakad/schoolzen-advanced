import { Component, OnInit, OnDestroy } from '@angular/core';
import { CookieService } from 'ngx-cookie-service';
import { Subscription } from "rxjs";
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { SchoolService } from 'src/app/services/school.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-header-navbar',
  templateUrl: './header-navbar.component.html',
  styleUrls: ['./header-navbar.component.css'],

})
export class HeaderNavbarComponent implements OnInit {
  nav: boolean = false;
  adminId!: String;
  schoolInfo: any;
  token: string = '';
  isAdminAuthenticated = false;
  private authListenerSubs: Subscription | undefined;
  constructor(private adminAuthService: AdminAuthService, private schoolService: SchoolService) { }

  ngOnInit(): void {
    this.nav = false;
    this.adminAuthService.autoAuthAdmin();
    this.isAdminAuthenticated = this.adminAuthService.getIsAuth();
    this.authListenerSubs = this.adminAuthService
      .getAuthStatusListener()
      .subscribe(isAdminAuthenticated => {
        this.isAdminAuthenticated = isAdminAuthenticated;
      });
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    const existingData = this.schoolService.getSchoolData();
    if (existingData) {
      this.schoolInfo = existingData;
    } else if(this.adminId){
      this.getSchool();
    }
  }

  hamburgerMenu(isNavOpen: boolean): void {
    this.nav = !isNavOpen; // This toggles the value of nav based on the current state
  }

  onLogout(user: string) {
    if (user === 'admin') {
      this.adminAuthService.logout();
    }
  }
  getSchool() {
    this.schoolService.getSchool(this.adminId).subscribe((res: any) => {
      if (res) {
        this.schoolInfo = res;
        this.schoolService.setSchoolData(res);
      }
    });
  }

  ngOnDestroy() {
    this.authListenerSubs?.unsubscribe();
  }

}
