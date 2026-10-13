/**
 * Dashboard (module 13) — read-only aggregation over every other module.
 *
 * Routing and declarations ONLY. The service and model live in the shared layer folders
 * (shared/services/dashboard/, shared/models/dashboard/), mirroring the backend's layout.
 */
import { NgModule } from '@angular/core';
import { SharedComponentsModule } from 'src/app/shared/shared-components.module';
import { DashboardRoutingModule } from './dashboard-routing.module';
import { DashboardComponent } from './dashboard/dashboard.component';

@NgModule({
  declarations: [DashboardComponent],
  imports: [SharedComponentsModule, DashboardRoutingModule]
})
export class DashboardModule {}