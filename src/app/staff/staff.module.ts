/**
 * Staff — Manage Staff, Departments, Designations (module 3).
 *
 * Routing and declarations ONLY. Services and models live in the shared layer folders
 * (shared/services/staff/, shared/models/staff/), mirroring the backend's layout.
 */
import { NgModule } from '@angular/core';
import { SharedComponentsModule } from 'src/app/shared/shared-components.module';
import { StaffRoutingModule } from './staff-routing.module';
import { ManageStaffComponent } from './manage-staff/manage-staff.component';
import { DepartmentsComponent } from './departments/departments.component';
import { DesignationsComponent } from './designations/designations.component';

@NgModule({
  declarations: [ManageStaffComponent, DepartmentsComponent, DesignationsComponent],
  imports: [SharedComponentsModule, StaffRoutingModule]
})
export class StaffModule {}
