import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PayrollPaymentHistoryComponent } from './payroll-payment-history.component';

const routes: Routes = [
  { path: '', component: PayrollPaymentHistoryComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PayrollPaymentHistoryRoutingModule { }
