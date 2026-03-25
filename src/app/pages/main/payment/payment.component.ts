import { Component, ElementRef, ViewChild, OnInit, Renderer2, Directive, HostListener, AfterViewInit, NgZone, inject, ViewEncapsulation, OnDestroy } from '@angular/core';
declare var Razorpay: any;
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { takeWhile } from 'rxjs/operators';
import { Router } from '@angular/router';
import { PaymentService } from 'src/app/services/payment/payment.service';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { AdminUserService } from 'src/app/services/admin-user.service';
import { PlansService } from 'src/app/services/plans.service';
import { SignupStepEnum, OtpStepEnum, SchoolDetailStepEnum, PaymentProcessStepEnum } from 'src/app/enums/payment-registration-steps.enum';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-payment',
  templateUrl: './payment.component.html',
  styleUrls: ['./payment.component.css'],
})
export class PaymentComponent implements OnInit, OnDestroy {
  signupForm: FormGroup;
  otpForm: FormGroup;
  adminDetailForm: FormGroup;
  SignupStepEnum = SignupStepEnum;
  OtpStepEnum = OtpStepEnum;
  SchoolDetailStepEnum = SchoolDetailStepEnum;
  PaymentProcessStepEnum = PaymentProcessStepEnum;
  hide: boolean = true;
  loader: Boolean = true;
  successMsg: String = '';
  paymentMode: boolean = false;
  errorMsg: string = '';
  check: boolean = false;
  paymentCompleted: Boolean = false;
  classInfo: any;
  adminInfo: any;
  stepShowing: boolean = false;
  signupStep: SignupStepEnum = SignupStepEnum.STEP_1;
  otpStep: OtpStepEnum = OtpStepEnum.STEP_1;
  schoolDetailStep: SchoolDetailStepEnum = SchoolDetailStepEnum.STEP_1;
  paymentProcessStep: PaymentProcessStepEnum = PaymentProcessStepEnum.STEP_1;
  otpMobile!: number;
  verified: Boolean = false;
  id: any;
  singlePlanInfo: any;
  taxes: any;
  totalAmount: any;
  numberOfStudent: number = 0;
  perStudentIncrementPrice: number = 5;
  studentIncrementRange: number = 50;
  whatsappMessageLimit: number = 0;
  perStudentIncrementWhatsappMessage: number = 10;
  subscriptionType: any;
  cooldownSeconds: number = 0;
  formattedCooldown: string = '00'; // डिस्प्ले के लिए फ़ॉर्मेटेड कूलडाउन टाइम
  timerSubscription: Subscription | undefined;
  otpSendLoading: boolean = false;





  indianStates: string[] = [
    'Andhra Pradesh',
    'Arunachal Pradesh',
    'Assam',
    'Bihar',
    'Chhattisgarh',
    'Goa',
    'Gujarat',
    'Haryana',
    'Himachal Pradesh',
    'Jharkhand',
    'Karnataka',
    'Kerala',
    'Madhya Pradesh',
    'Maharashtra',
    'Manipur',
    'Meghalaya',
    'Mizoram',
    'Nagaland',
    'Odisha',
    'Punjab',
    'Rajasthan',
    'Sikkim',
    'Tamil Nadu',
    'Telangana',
    'Tripura',
    'Uttar Pradesh',
    'Uttarakhand',
    'West Bengal'
  ];
  constructor(private fb: FormBuilder, private router: Router, private zone: NgZone, private el: ElementRef, private renderer: Renderer2, public activatedRoute: ActivatedRoute, private toastr: ToastrService, private paymentService: PaymentService, public plansService: PlansService, public adminAuthService: AdminAuthService, private adminUserService: AdminUserService) {

    this.signupForm = this.fb.group({
      mobile: ['', [Validators.required, Validators.pattern('^[6789]\\d{9}$')]],
    });
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
    this.adminDetailForm = this.fb.group({
      _id: [''],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(30)]],
      name: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s]+$')]],
      mobile: ['', [Validators.required, Validators.pattern('^[6789]\\d{9}$')]],
      city: ['', [Validators.required, Validators.maxLength(50)]],
      state: ['', [Validators.required, Validators.maxLength(50)]],
      address: ['', [Validators.required, Validators.maxLength(100)]],
      pinCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      schoolName: ['', [Validators.required, Validators.maxLength(50)]],
      affiliationNumber: ['', [Validators.required, Validators.maxLength(15)]],
    });
  }

  ngOnInit(): void {
    this.id = this.activatedRoute.snapshot.paramMap.get('id');
    this.subscriptionType = this.activatedRoute.snapshot.paramMap.get('subscription-type');
    this.restoreStepData();
    if (this.id) {
      this.getSinglePlans(this.id);
    }
    this.loadRazorpayScript();
    setTimeout(() => {
      this.loader = false;
    }, 1000)
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

  restoreStepData(): void {
    const savedStepId = localStorage.getItem('pymtFlowStpId');
    if (savedStepId) {
      this.getAdminPaymentStepStatus(savedStepId);
    } else {
      this.stepShowing = true;
    }
  }
  getAdminPaymentStepStatus(stepId: string): void {
    this.adminUserService.getAdminPaymentStepStatus(stepId).subscribe(
      (res: any) => {
        if (res && res.adminInfo) {
          this.adminInfo = res.adminInfo;
          this.signupStep = res.adminInfo.signupStep as SignupStepEnum;
          this.otpStep = res.adminInfo.otpStep as OtpStepEnum;
          this.schoolDetailStep = res.adminInfo.schoolDetailStep as SchoolDetailStepEnum;
          this.paymentProcessStep = res.adminInfo.paymentProcessStep as PaymentProcessStepEnum;
          this.otpMobile = res.adminInfo.mobile;
          this.verified = res.adminInfo.verified;
          this.adminDetailForm.patchValue({ mobile: this.otpMobile });
          this.stepShowing = true;
          if (this.signupStep == SignupStepEnum.STEP_2 && this.otpStep == OtpStepEnum.STEP_2) {
            this.sendWhatsappOtp(res.adminInfo.mobile);
          }
        }
      },
      (error) => {
        localStorage.removeItem('pymtFlowStpId');
        this.signupStep = SignupStepEnum.STEP_1; // Reset to initial state
        this.otpStep = OtpStepEnum.STEP_1;
        this.schoolDetailStep = SchoolDetailStepEnum.STEP_1;
        this.paymentProcessStep = PaymentProcessStepEnum.STEP_1;
        this.stepShowing = true;
      }
    );
  }
  updateStepsLocally(stepId: string): void {
    localStorage.setItem('pymtFlowStpId', stepId);
  }

  updateNumber(value: number): void {
    this.numberOfStudent += value;
    this.totalAmount += value * this.perStudentIncrementPrice;
    this.whatsappMessageLimit += value * this.perStudentIncrementWhatsappMessage;
  }
  loadRazorpayScript(): void {
    const script = this.renderer.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => {
    };
    this.renderer.appendChild(this.el.nativeElement, script);
  }

  getSinglePlans(id: any) {
    this.plansService.getSinglePlans(id).subscribe((res: any) => {
      if (res) {
        let price = 0;

        switch (this.subscriptionType) {
          case 'annual':
            price = parseInt(res.price);
            break;
          case 'one-month-trial':
            price = parseInt(res.monthlyTrialPrice);
            break;
          case 'free-trial':
            price = 0;
            break;
          default:
            price = 0; // or handle unknown plan type
            break;
        }
        // this.taxes = price * 18 / 100;
        this.taxes = 0;
        this.totalAmount = price + this.taxes;
        this.numberOfStudent = res.studentLimit;
        this.perStudentIncrementPrice = res.perStudentIncrementPrice;
        this.studentIncrementRange = res.studentIncrementRange;
        this.whatsappMessageLimit = res.whatsappMessageLimit;
        this.perStudentIncrementWhatsappMessage = res.perStudentIncrementWhatsappMessage;
        this.singlePlanInfo = res;
      }
    })
  }
  signup() {
    this.adminAuthService.signup(this.signupForm.value).subscribe((res: any) => {
      if (res) {
        this.otpMobile = res.mobile;
        this.signupStep = res.adminInfo.signupStep as SignupStepEnum;
        this.otpStep = res.adminInfo.otpStep as OtpStepEnum;
        this.schoolDetailStep = res.adminInfo.schoolDetailStep as SchoolDetailStepEnum;
        this.adminInfo = res.adminInfo;
        this.updateStepsLocally(res.adminInfo.stepId);
        if (res.adminInfo.signupStep == SignupStepEnum.STEP_2 && res.adminInfo.otpStep == OtpStepEnum.STEP_2 && res.adminInfo.schoolDetailStep == SchoolDetailStepEnum.STEP_1) {
          this.sendWhatsappOtp(res.adminInfo.mobile);
        }
      }
    }, err => {
      if (err.error.infoStaus) {
        this.toastr.info('', err.error.errorMsg);
        this.otpMobile = err.error.mobile;
        this.signupStep = err.error.adminInfo.signupStep as SignupStepEnum;
        this.otpStep = err.error.adminInfo.otpStep as OtpStepEnum;
        this.schoolDetailStep = err.error.adminInfo.schoolDetailStep as SchoolDetailStepEnum;
        this.adminInfo = err.error.adminInfo;
        this.verified = err.error.verified;
        this.updateStepsLocally(err.error.adminInfo.stepId);
        if (err.error.verified) {
          this.adminDetailForm.patchValue({ mobile: err.error.adminInfo.mobile });
        }
        if (err.error.adminInfo.signupStep == SignupStepEnum.STEP_2 && err.error.adminInfo.otpStep == OtpStepEnum.STEP_2 && err.error.adminInfo.schoolDetailStep == SchoolDetailStepEnum.STEP_1 && !err.error.verified) {
          this.sendWhatsappOtp(err.error.adminInfo.mobile);
        }
      }
      if (err.error.errorStaus) {
        this.toastr.error('', err.error.errorMsg);
      }
    })
  }

  submitOtp() {
    const otp = `${this.otpForm.value.digit1}${this.otpForm.value.digit2}${this.otpForm.value.digit3}${this.otpForm.value.digit4}${this.otpForm.value.digit5}${this.otpForm.value.digit6}`;
    this.otpForm.value.mobile = this.otpMobile;
    this.otpForm.value.otp = otp;
    if (this.otpForm.value.mobile && this.otpForm.value.otp) {
      this.adminAuthService.varifyOTP(this.otpForm.value).subscribe((res: any) => {
        if (res) {
          this.errorMsg = '';
          this.signupStep = res.adminInfo.signupStep as SignupStepEnum;
          this.otpStep = res.adminInfo.otpStep as OtpStepEnum;
          this.schoolDetailStep = res.adminInfo.schoolDetailStep as SchoolDetailStepEnum;
          this.verified = res.adminInfo.verified;
          this.successMsg = res.successMsg;
          this.adminInfo = res.adminInfo;
          this.adminDetailForm.patchValue({ mobile: this.otpMobile });
          this.updateStepsLocally(res.adminInfo.stepId);
        }

      }, err => {
        this.toastr.error('', err.error.errorMsg);
      })
    }
  }
  adminDetailUpdate() {
    this.adminDetailForm.value._id = this.adminInfo._id;
    this.adminUserService.updateAdminDetail(this.adminDetailForm.value).subscribe((res: any) => {
      if (res) {
        this.signupStep = res.adminInfo.signupStep as SignupStepEnum;
        this.otpStep = res.adminInfo.otpStep as OtpStepEnum;
        this.schoolDetailStep = res.adminInfo.schoolDetailStep as SchoolDetailStepEnum;
        this.verified = res.adminInfo.verified;
        this.adminInfo = res.adminInfo;
        this.updateStepsLocally(res.adminInfo.stepId);
      }
    })
  }

  createPayment() {
    const adminId = this.adminInfo._id;
    const amount = this.totalAmount;
    const activePlan = this.singlePlanInfo.plans;
    const currency = 'INR';
    const paymentData = { adminId: adminId, activePlan: activePlan, amount: amount, currency: currency };
    this.paymentService.createPayment(paymentData).subscribe(
      (response: any) => {
        const options = {
          key: 'rzp_live_SMQMKG6pAOcVVq',
          amount: response.order.amount,
          currency: response.order.currency,
          name: 'Schoolzen',
          description: 'Payment for Your Product',
          image: '../../../../assets/logo-icon.png',
          prefill: {
            name: this.adminInfo.name,
            email: this.adminInfo.email,
            contact: this.adminInfo.mobile,
            method: 'online'
          },
          theme: {
            color: '#8d6dff',
          },
          order_id: response.order.id,
          handler: this.paymentHandler.bind(this),
        };
        Razorpay.open(options);
        this.stepShowing = false;
      },
      (error) => {
        this.errorMsg = 'Payment creation failed. Please try again later.';
      }
    );
  }

  paymentHandler(response: any) {
    const razorpayPaymentId = response.razorpay_payment_id;
    const razorpayOrderId = response.razorpay_order_id;
    const razorpaySignature = response.razorpay_signature;
    const paymentData = {
      payment_id: razorpayPaymentId,
      order_id: razorpayOrderId,
      signature: razorpaySignature,
      name: this.adminInfo.name,
      mobile: this.adminInfo.mobile,
      id: this.adminInfo._id,
      activePlan: this.singlePlanInfo.plans,
      amount: this.totalAmount,
      currency: 'INR',
      studentLimit: this.numberOfStudent,
      teacherLimit: this.singlePlanInfo.teacherLimit,
      whatsappMessageLimit: this.whatsappMessageLimit,
      subscriptionType: this.subscriptionType,
    }
    this.paymentService.validatePayment(paymentData).subscribe(
      (validationResponse: any) => {
        if (validationResponse) {
          this.zone.run(() => {
            this.loader = true;
            this.adminAuthService.deleteAllCookies();
            this.paymentProcessStep = PaymentProcessStepEnum.STEP_2;
            this.paymentCompleted = true;
            this.verified = false;
            this.errorMsg = '';
            this.successMsg = validationResponse.successMsg;
            localStorage.removeItem('pymtFlowStpId');
            this.adminAuthService.deleteAllCookies();
            const accessToken = validationResponse.accessToken;
            const refreshToken = validationResponse.refreshToken;
            this.adminAuthService.storeAccessToken(accessToken);
            this.adminAuthService.storeRefreshToken(refreshToken);
            this.router.navigate(["/admin/dashboard"], { replaceUrl: true });
            this.toastr.success('', 'Congratulations! Your plan is now active.');
          });
        }
      },
      (validationError: any) => {
        this.zone.run(() => {
          this.errorMsg = 'Payment validation failed. Please contact support.';
        });
      }
    );
  }

  onEmailInput() {
    const emailControl = this.adminDetailForm.get('email');
    const val = emailControl?.value;
    if (val) {
      emailControl?.setValue(val.toLowerCase(), { emitEvent: false });
    }
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
  openInNewTab(route: string) {
    const url = this.router.serializeUrl(
      this.router.createUrlTree([route])
    );
    window.open(url, '_blank');
  }
  ngOnDestroy(): void {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
  }
}