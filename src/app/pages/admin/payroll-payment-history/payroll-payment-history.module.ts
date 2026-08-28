import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PayrollPaymentHistoryRoutingModule } from './payroll-payment-history-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { PayrollPaymentHistoryComponent } from './payroll-payment-history.component';


@NgModule({
  declarations: [
    PayrollPaymentHistoryComponent
  ],
  imports: [
    CommonModule,
    PayrollPaymentHistoryRoutingModule,

    AdminSharedModule,
  ]
})
export class PayrollPaymentHistoryModule { }
