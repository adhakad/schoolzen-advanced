import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SalesAuthService } from 'src/app/services/auth/sales-auth.service';

@Component({
  selector: 'app-sales-login',
  templateUrl: './sales-login.component.html',
  styleUrls: ['./sales-login.component.css']
})
export class SalesLoginComponent implements OnInit {
  errorMsg: string = '';
  loginForm: FormGroup;
  hide: boolean = true;
  constructor(private fb: FormBuilder, private router: Router, private salesAuthService: SalesAuthService) {
    this.loginForm = this.fb.group({
      salesUserId: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(20)]],
      password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(30)]],
    })
  }
  ngOnInit(): void {
  }

  login() {
    if (this.loginForm.valid) {
      this.salesAuthService.login(this.loginForm.value).subscribe((res: any) => {
        if (res) {
          const accessToken = res.accessToken;
          const refreshToken = res.refreshToken;
          this.salesAuthService.storeAccessToken(accessToken);
          this.salesAuthService.storeRefreshToken(refreshToken);
          this.router.navigate(["/sales/device"], { replaceUrl: true });
        }
      }, err => {
        this.errorMsg = err.error;
      })
    }
  }
}
