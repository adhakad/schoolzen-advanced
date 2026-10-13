/**
 * Approvals — the cross-module Requests inbox (module 11).
 *
 * Routing and declarations ONLY. The service and model live in the shared layer folders
 * (shared/services/approvals/, shared/models/approvals/), mirroring the backend's layout.
 */
import { NgModule } from '@angular/core';
import { SharedComponentsModule } from 'src/app/shared/shared-components.module';
import { ApprovalsRoutingModule } from './approvals-routing.module';
import { RequestsComponent } from './requests/requests.component';

@NgModule({
  declarations: [RequestsComponent],
  imports: [SharedComponentsModule, ApprovalsRoutingModule]
})
export class ApprovalsModule {}
