import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AttendanceOverviewComponent } from './attendance-overview/attendance-overview.component';
import { ManageShiftsComponent } from './manage-shifts/manage-shifts.component';
import { RosterComponent } from './roster/roster.component';

// Mounted by v2-routing.module.ts at /v2/attendance — matches the sidebar's links.
const routes: Routes = [
  { path: '', redirectTo: 'overview', pathMatch: 'full' },
  { path: 'overview', component: AttendanceOverviewComponent },
  { path: 'shifts', component: ManageShiftsComponent },
  { path: 'roster', component: RosterComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AttendanceRoutingModule {}
