import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LiveAttendanceRoutingModule } from './live-attendance-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { LiveAttendanceComponent } from './live-attendance.component';


@NgModule({
  declarations: [
    LiveAttendanceComponent
  ],
  imports: [
    CommonModule,
    LiveAttendanceRoutingModule,

    AdminSharedModule,
  ]
})
export class LiveAttendanceModule { }
