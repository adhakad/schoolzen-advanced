import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LeaveRequestsComponent } from './leave-requests/leave-requests.component';
import { LeaveCreateComponent } from './leave-create/leave-create.component';
import { LeaveAssignComponent } from './leave-assign/leave-assign.component';

// Mounted by v2-routing.module.ts at /v2/leave — matches the sidebar's links.
const routes: Routes = [
  { path: '', redirectTo: 'requests', pathMatch: 'full' },
  { path: 'requests', component: LeaveRequestsComponent },
  { path: 'create', component: LeaveCreateComponent },
  { path: 'assign', component: LeaveAssignComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class LeaveRoutingModule {}
