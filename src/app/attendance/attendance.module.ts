/**
 * Attendance — Overview, Manage Shifts, Roster (module 4).
 *
 * Routing and declarations ONLY. Services and models live in the shared layer folders
 * (shared/services/attendance/, shared/models/attendance/), mirroring the backend's layout.
 */
import { NgModule } from '@angular/core';
import { SharedComponentsModule } from 'src/app/shared/shared-components.module';
import { AttendanceRoutingModule } from './attendance-routing.module';
import { AttendanceOverviewComponent } from './attendance-overview/attendance-overview.component';
import { ManageShiftsComponent } from './manage-shifts/manage-shifts.component';
import { RosterComponent } from './roster/roster.component';
import { MonthNavComponent } from './month-nav/month-nav.component';

@NgModule({
  declarations: [AttendanceOverviewComponent, ManageShiftsComponent, RosterComponent, MonthNavComponent],
  imports: [SharedComponentsModule, AttendanceRoutingModule]
})
export class AttendanceModule {}
