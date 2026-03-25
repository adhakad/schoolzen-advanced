import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { TeacherAuthService } from 'src/app/services/auth/teacher-auth.service';

@Component({
  selector: 'app-teacher-login',
  templateUrl: './teacher-login.component.html',
  styleUrls: ['./teacher-login.component.css']
})
export class TeacherLoginComponent implements OnInit {
  errorMsg: string = '';
  loginForm: FormGroup;
  hide: boolean = true;
  constructor(private fb: FormBuilder, private router: Router, private adminAuthService: AdminAuthService, private teacherAuthService: TeacherAuthService) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(20), Validators.pattern(/^[a-zA-Z0-9_]+$/)]],
      password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(30)]],
      schoolId: ['', [Validators.required, Validators.pattern(/^\d{6}$/), Validators.pattern('^[0-9]+$')]],
    })
  }
  ngOnInit(): void {
  }

  login() {
    if (this.loginForm.valid) {
      if (this.adminAuthService.getAccessToken()) {
        this.errorMsg = "Login not valid,you are already logged in another account !";
        return
      }
      this.teacherAuthService.login(this.loginForm.value).subscribe((res: any) => {
        if (res) {
          const accessToken = res.accessToken;
          const refreshToken = res.refreshToken;
          this.teacherAuthService.storeAccessToken(accessToken);
          this.teacherAuthService.storeRefreshToken(refreshToken);
          this.router.navigate(["/teacher/dashboard"], { replaceUrl: true });
        }
      }, err => {
        this.errorMsg = err.error;
      })
    }
  }


}
