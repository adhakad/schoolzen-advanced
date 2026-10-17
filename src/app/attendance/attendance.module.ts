/**
 * Attendance — Overview, Manage Shifts, Roster (module 4).
 *
 * Routing ONLY: each page is declared in its own lazily loaded page module (global-fixes.md
 * rule 3), so this chunk is just the three route entries. Services and models live in the
 * shared layer folders (shared/services/attendance/, shared/models/attendance/).
 */
import { NgModule } from '@angular/core';
import { AttendanceRoutingModule } from './attendance-routing.module';

@NgModule({
  imports: [AttendanceRoutingModule]
})
export class AttendanceModule {}
