import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RequestsComponent } from './requests/requests.component';

// The sidebar's single Approvals entry is /v2/approvals — the inbox is its only page.
const routes: Routes = [
  { path: '', component: RequestsComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ApprovalsRoutingModule {}
