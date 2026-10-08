import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ManageStaffComponent } from './manage-staff/manage-staff.component';
import { DepartmentsComponent } from './departments/departments.component';
import { DesignationsComponent } from './designations/designations.component';

// Mounted by v2-routing.module.ts at /v2/staff — matches the sidebar's links.
const routes: Routes = [
  { path: '', redirectTo: 'manage-staff', pathMatch: 'full' },
  { path: 'manage-staff', component: ManageStaffComponent },
  { path: 'departments', component: DepartmentsComponent },
  { path: 'designations', component: DesignationsComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class StaffRoutingModule {}
