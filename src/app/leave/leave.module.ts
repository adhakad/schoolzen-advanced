/**
 * Leave — Requests, Leave Create, Leave Assign (module 5).
 *
 * Routing and declarations ONLY. Services and models live in the shared layer folders
 * (shared/services/leave/, shared/models/leave/), mirroring the backend's layout.
 */
import { NgModule } from '@angular/core';
import { SharedComponentsModule } from 'src/app/shared/shared-components.module';
import { LeaveRoutingModule } from './leave-routing.module';
import { LeaveRequestsComponent } from './leave-requests/leave-requests.component';
import { LeaveCreateComponent } from './leave-create/leave-create.component';
import { LeaveAssignComponent } from './leave-assign/leave-assign.component';
import { PersonFilterComponent } from './person-filter/person-filter.component';

@NgModule({
  declarations: [LeaveRequestsComponent, LeaveCreateComponent, LeaveAssignComponent, PersonFilterComponent],
  imports: [SharedComponentsModule, LeaveRoutingModule]
})
export class LeaveModule {}
