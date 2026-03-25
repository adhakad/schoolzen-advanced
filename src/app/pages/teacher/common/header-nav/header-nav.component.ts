import { Component, OnInit, OnDestroy } from '@angular/core';
import { CookieService } from 'ngx-cookie-service';
import { Subscription } from "rxjs";
import { TeacherAuthService } from 'src/app/services/auth/teacher-auth.service';
import { TeacherService } from 'src/app/services/teacher.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-header-nav',
  templateUrl: './header-nav.component.html',
  styleUrls: ['./header-nav.component.css']
})
export class HeaderNavComponent implements OnInit {
  teacherInfo: any;
  admissionPermission: boolean = false;
  studentPermission: boolean = false;
  admitCardPermission: boolean = false;
  marksheetPermission: boolean = false;
  feeCollectionPermission: boolean = false;
  promoteFailPermission: boolean = false;
  transferCertificatePermission: boolean = false;
  adminId!: String
  nav: boolean = false;

  token: string = '';
  isTeacherAuthenticated = false;
  private authListenerSubs: Subscription | undefined;
  constructor(private teacherAuthService: TeacherAuthService, private teacherService: TeacherService) { }

  ngOnInit(): void {
    this.nav = false;
    this.teacherAuthService.autoAuthTeacher();
    this.isTeacherAuthenticated = this.teacherAuthService.getIsAuth();
    this.authListenerSubs = this.teacherAuthService
      .getAuthStatusListener()
      .subscribe(isTeacherAuthenticated => {
        this.isTeacherAuthenticated = isTeacherAuthenticated;
      });
    this.teacherInfo = this.teacherAuthService.getLoggedInTeacherInfo();
    this.adminId = this.teacherInfo?.adminId;
    if (this.teacherInfo) {
      this.getTeacherById(this.teacherInfo)
    }
  }

  // hamburgerMenu(val:boolean){
  //   if(val==false){
  //     this.nav = true;
  //   }else if(val==true){
  //     this.nav = false;
  //   }
  // }
  hamburgerMenu(isNavOpen: boolean): void {
    this.nav = !isNavOpen; // This toggles the value of nav based on the current state
  }
  getTeacherById(teacherInfo:any){
    let params = {
      adminId:teacherInfo.adminId,
      teacherUserId:teacherInfo.id,
    }
    this.teacherService.getTeacherById(params).subscribe((res:any)=> {
      if(res){
        if(res.admissionPermission?.status==true){
          this.admissionPermission = true;
        }
        if(res.studentPermission?.status==true){
          this.studentPermission = true;
        }
        if(res.feeCollectionPermission?.status==true){
          this.feeCollectionPermission = true;
        }
        if(res.admitCardPermission?.status==true){
          this.admitCardPermission = true;
        }
        if(res.marksheetPermission?.status==true){
          this.marksheetPermission = true;
        }
        if(res.promoteFailPermission?.status==true){
          this.promoteFailPermission = true;
        }
        if(res.transferCertificatePermission?.status==true){
          this.transferCertificatePermission = true;
        }
      }
    })
  }
  onLogout(user: string) {
    if (user === 'teacher') {
      this.teacherAuthService.logout();
    }
  }

  ngOnDestroy() {
    this.authListenerSubs?.unsubscribe();
  }
}