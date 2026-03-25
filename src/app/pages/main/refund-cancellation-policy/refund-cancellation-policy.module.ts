import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { RefundCancellationPolicyRoutingModule } from './refund-cancellation-policy-routing.module';
import { RefundCancellationPolicyComponent } from './refund-cancellation-policy.component';
import { MainSharedModule } from '../main-shared/main-shared.module';


@NgModule({
  declarations: [
    RefundCancellationPolicyComponent
  ],
  imports: [
    CommonModule,
    RefundCancellationPolicyRoutingModule,
    MainSharedModule
  ]
})
export class RefundCancellationPolicyModule { }
