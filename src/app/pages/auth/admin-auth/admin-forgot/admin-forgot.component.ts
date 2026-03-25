import { Component, ElementRef, ViewChild, OnInit, Renderer2, Directive, HostListener, AfterViewInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, timer } from 'rxjs';
import { takeWhile } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { AdminUserService } from 'src/app/services/admin-user.service';
import { ToastrService } from 'ngx-toastr';


@Component({
  selector: 'app-admin-forgot',
  templateUrl: './admin-forgot.component.html',
  styleUrls: ['./admin-forgot.component.css']
})
export class AdminForgotComponent implements OnInit, OnDestroy {
  errorMsg: string = '';
  successMsg: String = '';
  forgotForm: FormGroup;
  otpForm: FormGroup;
  resetForm: FormGroup;
  formType: String = 'Forgot';
  hide: boolean = true;
  mobile: any;
  varifiedAdminInfo: any;
  cooldownSeconds: number = 0;
  formattedCooldown: string = '00'; // डिस्प्ले के लिए फ़ॉर्मेटेड कूलडाउन टाइम
  timerSubscription: Subscription | undefined;
  otpSendLoading: boolean = false;
  constructor(private fb: FormBuilder, private router: Router, private toastr: ToastrService, private adminAuthService: AdminAuthService, private adminUserService: AdminUserService) {
    this.forgotForm = this.fb.group({
      mobile: ['', [Validators.required, Validators.pattern('^[6789]\\d{9}$')]],
    })
    this.otpForm = this.fb.group({
      mobile: [''],
      otp: [''],
      digit1: ['', Validators.required],
      digit2: ['', Validators.required],
      digit3: ['', Validators.required],
      digit4: ['', Validators.required],
      digit5: ['', Validators.required],
      digit6: ['', Validators.required]
    });
    this.resetForm = this.fb.group({
      mobile: [''],
      password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(30)]],
    })
  }

  ngOnInit(): void {
  }

  sendWhatsappOtp(otpMobile: number): void {
    if (!otpMobile) {
      return;
    }

    this.otpSendLoading = true;
    this.adminUserService.sendWhatsappOtp(otpMobile).subscribe({
      next: (response) => {
        this.toastr.success('', response.successMsg);
        this.otpSendLoading = false;
        this.cooldownSeconds = 60;
        this.startResendTimer();
      },
      error: (errorRes) => {
        this.otpSendLoading = false;
        this.toastr.error('', errorRes.error.errorMsg);
        if (errorRes.status === 429) {
          this.cooldownSeconds = errorRes.error.cooldownRemaining || 0;
          if (this.cooldownSeconds > 0) {
            this.startResendTimer();
          } else {
            // यदि कूलडाउन 0 या उससे कम है, तो तुरंत रीसेंड करने की अनुमति दें
          }
        } else {

        }
      }
    });
  }
  startResendTimer(): void {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }

    if (this.cooldownSeconds > 0) {
      this.timerSubscription = timer(0, 1000)
        .pipe(takeWhile(() => this.cooldownSeconds > 0))
        .subscribe(() => {
          this.updateFormattedCooldown();
          this.cooldownSeconds--;
        });
    }
  }

  // **सही किया गया हेल्पर फ़ंक्शन: कूलडाउन सेकंड्स को फ़ॉर्मेट करना**
  private updateFormattedCooldown(): void {
    const minutes = Math.floor(this.cooldownSeconds / 60);
    const seconds = this.cooldownSeconds % 60;

    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(seconds).padStart(2, '0');

    this.formattedCooldown = `${formattedMinutes}:${formattedSeconds}`;
  }


  forgotPassword() {
    if (this.forgotForm.valid) {
      this.adminAuthService.forgotPassword(this.forgotForm.value).subscribe((res: any) => {
        if (res) {
          this.mobile = res.mobile;
          this.formType = 'VarifyOTP';
          this.sendWhatsappOtp(res.mobile);
        }
      }, err => {
        this.toastr.error('', err.error.errorMsg);
      })
    }
  }

  submitOtp() {
    const otp = `${this.otpForm.value.digit1}${this.otpForm.value.digit2}${this.otpForm.value.digit3}${this.otpForm.value.digit4}${this.otpForm.value.digit5}${this.otpForm.value.digit6}`;
    this.otpForm.value.mobile = this.mobile;
    this.otpForm.value.otp = otp;
    if (this.otpForm.value.mobile && this.otpForm.value.otp) {
      this.adminAuthService.varifyOTP(this.otpForm.value).subscribe((res: any) => {
        if (res) {
          this.mobile = res.adminInfo.mobile;
          this.formType = 'Reset';
          this.toastr.success('', res.successMsg);
        }

      }, err => {
        this.toastr.error('', err.error.errorMsg);
      })
    }
  }

  passwordReset() {
    this.resetForm.value.mobile = this.mobile;
    this.adminAuthService.passwordReset(this.resetForm.value).subscribe((res: any) => {
      if (res) {
        this.toastr.success('', res.successMsg);
        this.router.navigate(["/admin/login"], { replaceUrl: true });
        // }
      }
    }, err => {
      this.toastr.error('', err.error.errorMsg);
    })
  }

  @HostListener('input', ['$event']) onInput(event: KeyboardEvent) {
    const input = event.target as HTMLInputElement;
    const maxLength = parseInt(input.getAttribute('maxlength') || '1');
    if (input.value.length >= maxLength) {
      const nextInput = input.nextElementSibling as HTMLInputElement;
      if (nextInput) {
        nextInput.focus();
      }
    }
  }

  @HostListener('keydown', ['$event']) onKeyDown(event: KeyboardEvent) {
    const input = event.target as HTMLInputElement;
    const previousInput = input.previousElementSibling as HTMLInputElement;

    if (event.key === 'Backspace' && !input.value) {
      if (previousInput) {
        previousInput.focus();
      }
    }
  }
  ngOnDestroy(): void {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
  }

}
