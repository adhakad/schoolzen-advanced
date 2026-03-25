import { Component, ElementRef, ViewChild, OnInit, Renderer2, Directive, HostListener, AfterViewInit, NgZone } from '@angular/core';
declare var Razorpay: any;
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

import { ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import { PaymentService } from 'src/app/services/payment/payment.service';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
// import { AdminPlanService } from 'src/app/services/admin-plan.service';
import { AdminUserService } from 'src/app/services/admin-user.service';
import { PlansService } from 'src/app/services/plans.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-upgrade-plan-payment',
  templateUrl: './upgrade-plan-payment.component.html',
  styleUrls: ['./upgrade-plan-payment.component.css']
})
export class UpgradePlanPaymentComponent implements OnInit {

  loader: Boolean = true;
  successMsg: String = '';
  paymentMode: boolean = false;
  errorMsg: string = '';
  check: boolean = false;
  paymentCompleted: Boolean = false;
  classInfo: any;
  adminInfo: any;
  getOTP: Boolean = true;
  varifyOTP: Boolean = false;
  email: any;
  verified: Boolean = false;
  id: any;
  singlePlanInfo: any;
  taxes: any;
  totalAmount: any;
  step: number = 1;
  numberOfStudent: number = 0;
  perStudentIncrementPrice: number = 5;
  studentIncrementRange: number = 50;
  adminId!: string;
  constructor(private fb: FormBuilder, private router: Router, private zone: NgZone, private el: ElementRef, private renderer: Renderer2, public activatedRoute: ActivatedRoute, private toastr: ToastrService, private paymentService: PaymentService, private adminUserService: AdminUserService, public plansService: PlansService, public adminAuthService: AdminAuthService) {

  }

  ngOnInit(): void {
    this.id = this.activatedRoute.snapshot.paramMap.get('id');
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    if (this.id && this.adminId) {
      this.getSinglePlans(this.id);
      this.getSingleAdminUser(this.adminId);
    }
    this.loadRazorpayScript();
    setTimeout(() => {
      this.loader = false;
    }, 1000)
  }
  updateNumber(value: number): void {
    this.numberOfStudent += value;
    this.totalAmount += value * this.perStudentIncrementPrice;
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
        let price = parseInt(res.upgradePrice);
        // this.taxes = price * 18 / 100;
        this.taxes = 0;
        this.totalAmount = price + this.taxes;
        this.numberOfStudent = res.studentLimit;
        this.perStudentIncrementPrice = res.perStudentIncrementPrice;
        this.studentIncrementRange = res.studentIncrementRange;
        this.singlePlanInfo = res;
      }
    })
  }
  getSingleAdminUser(adminId: any) {
    this.adminUserService.getSingleAdminUser(adminId).subscribe((res: any) => {
      if (res) {
        this.adminInfo = res;
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
          image: '../../../../assets/logo.png',
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
      email: this.adminInfo.email,
      id: this.adminInfo._id,
      activePlan: this.singlePlanInfo.plans,
      amount: this.totalAmount,
      currency: 'INR',
      studentLimit: this.singlePlanInfo.studentLimit,
      teacherLimit: this.singlePlanInfo.teacherLimit,


    }
    this.paymentService.validateUpgradePayment(paymentData).subscribe(
      (validationResponse: any) => {
        if (validationResponse) {
          this.zone.run(() => {
            this.paymentCompleted = true;
            this.errorMsg = '';
            this.successMsg = validationResponse.successMsg;
            this.router.navigate(["/admin/upgrade-plan"], { replaceUrl: true });
            this.toastr.success('','Congratulations! Your plan has been upgraded.');
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
}
