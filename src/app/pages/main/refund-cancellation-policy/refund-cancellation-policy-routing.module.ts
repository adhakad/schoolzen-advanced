import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RefundCancellationPolicyComponent } from './refund-cancellation-policy.component';

const routes: Routes = [
  { path: '', component: RefundCancellationPolicyComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RefundCancellationPolicyRoutingModule { }
