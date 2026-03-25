import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UpgradePlanPaymentComponent } from './upgrade-plan-payment.component';

const routes: Routes = [
  { path: '', component: UpgradePlanPaymentComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class UpgradePlanPaymentRoutingModule { }
