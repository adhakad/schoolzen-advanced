/**
 * AttendanceOverview page — its own lazy chunk (global-fixes.md rule 3: lazy loading per page route, not
 * per module), so opening one Attendance page never downloads the other two.
 */
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedComponentsModule } from 'src/app/shared/shared-components.module';
import { AttendanceOverviewComponent } from './attendance-overview.component';

@NgModule({
  declarations: [AttendanceOverviewComponent],
  imports: [SharedComponentsModule, RouterModule.forChild([{ path: '', component: AttendanceOverviewComponent }])]
})
export class AttendanceOverviewModule {}
