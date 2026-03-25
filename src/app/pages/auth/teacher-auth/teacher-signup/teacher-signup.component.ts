import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TeacherAuthService } from 'src/app/services/auth/teacher-auth.service';

@Component({
  selector: 'app-teacher-signup',
  templateUrl: './teacher-signup.component.html',
  styleUrls: ['./teacher-signup.component.css']
})
export class TeacherSignupComponent implements OnInit {

  errorMsg: string = '';
  signupForm: FormGroup;
  hide: boolean = true;
  constructor(private fb: FormBuilder, public teacherAuthService: TeacherAuthService, private router: Router) {
    this.signupForm = this.fb.group({
      email: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(25), Validators.pattern(/^[a-zA-Z0-9_]+$/)]],
      password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(30)]],
      otp: ['', [Validators.required, Validators.pattern(/^\d{6}$/), Validators.pattern('^[0-9]+$')]],
      schoolId: ['', [Validators.required, Validators.pattern(/^\d{6}$/), Validators.pattern('^[0-9]+$')]],
      teacherUserId: ['', [Validators.required, Validators.pattern(/^\d{6}$/), Validators.pattern('^[0-9]+$')]],
    })
  }
  ngOnInit(): void {
  }


  signup() {
    if (this.signupForm.valid) {
      this.teacherAuthService.signup(this.signupForm.value).subscribe((res: any) => {
        if (res) {
          this.router.navigate(['/teacher/login']);
        }
      }, err => {
        this.errorMsg = err.error;
      })
    }
  }
}
