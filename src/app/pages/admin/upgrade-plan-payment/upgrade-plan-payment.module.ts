import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { UpgradePlanPaymentRoutingModule } from './upgrade-plan-payment-routing.module';
import { UpgradePlanPaymentComponent } from './upgrade-plan-payment.component';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';


@NgModule({
  declarations: [
    UpgradePlanPaymentComponent
  ],
  imports: [
    CommonModule,
    UpgradePlanPaymentRoutingModule,
    AdminSharedModule
  ]
})
export class UpgradePlanPaymentModule { }
