import { Component, OnInit } from '@angular/core';
import { TeacherAuthService } from 'src/app/services/auth/teacher-auth.service';
import { TeacherService } from 'src/app/services/teacher.service';
@Component({
  selector: 'app-side-nav',
  templateUrl: './side-nav.component.html',
  styleUrls: ['./side-nav.component.css']
})
export class SideNavComponent implements OnInit {
  teacherInfo:any;
  admissionPermission:boolean = false;
  studentPermission:boolean = false;
  admitCardPermission:boolean = false;
  marksheetPermission:boolean = false;
  feeCollectionPermission:boolean = false;
  promoteFailPermission:boolean = false;
  transferCertificatePermission:boolean = false;
  adminId!: String
  constructor(private teacherAuthService:TeacherAuthService,private teacherService:TeacherService) { }

  ngOnInit(): void {
    this.teacherInfo = this.teacherAuthService.getLoggedInTeacherInfo();
    this.adminId = this.teacherInfo?.adminId;
    if (this.teacherInfo) {
      const storedPermissions = this.teacherAuthService.getPermissions();
      
      if (storedPermissions) {
        this.setPermissions(storedPermissions);
      } else {
        this.getTeacherById(this.teacherInfo);
      }
    }
  }

  getTeacherById(teacherInfo: any) {
    let params = {
      adminId: teacherInfo.adminId,
      teacherUserId: teacherInfo.id,
    };
  
    this.teacherService.getTeacherById(params).subscribe((res: any) => {
      if (res) {
        console.log(res)
        this.teacherAuthService.setPermissions(res); // Store permissions in service
        this.setPermissions(res);
      }
    });
  }
  
  setPermissions(res: any) {
    this.admissionPermission = res.admissionPermission?.status || false;
    this.studentPermission = res.studentPermission?.status || false;
    this.feeCollectionPermission = res.feeCollectionPermission?.status || false;
    this.admitCardPermission = res.admitCardPermission?.status || false;
    this.marksheetPermission = res.marksheetPermission?.status || false;
    this.promoteFailPermission = res.promoteFailPermission?.status || false;
    this.transferCertificatePermission = res.transferCertificatePermission?.status || false;
  }

}
