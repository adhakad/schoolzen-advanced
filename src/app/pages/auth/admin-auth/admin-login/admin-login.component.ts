import { Component,OnInit} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { TeacherAuthService } from 'src/app/services/auth/teacher-auth.service';
@Component({
  selector: 'app-admin-login',
  templateUrl: './admin-login.component.html',
  styleUrls: ['./admin-login.component.css']
})
export class AdminLoginComponent implements OnInit{
  errorMsg:string ='';
  loginForm: FormGroup;
  hide:boolean=true;
  constructor(private fb: FormBuilder,private router:Router,private adminAuthService: AdminAuthService,private teacherAuthService: TeacherAuthService) {
    this.loginForm = this.fb.group({
      mobile: ['', [Validators.required, Validators.pattern('^[6789]\\d{9}$')]],
      password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(30)]],
    })
  }
  ngOnInit(): void {
  }

  login() {
    if (this.loginForm.valid) {
      if(this.teacherAuthService.getAccessToken()){
        this.errorMsg = "Login not valid,you are already logged in another account !";
        return
      }
      this.adminAuthService.login(this.loginForm.value).subscribe((res:any) => {
        if(res){
          const accessToken = res.accessToken;
          const refreshToken = res.refreshToken;
          this.adminAuthService.storeAccessToken(accessToken);
          this.adminAuthService.storeRefreshToken(refreshToken);
          this.router.navigate(["/admin/dashboard"], { replaceUrl: true });
        }
      },err => {
        this.errorMsg = err.error.errorMsg;
      })
    }
  }

}
