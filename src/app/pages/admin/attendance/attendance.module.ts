import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AttendanceRoutingModule } from './attendance-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { AttendanceComponent } from './attendance.component';


@NgModule({
  declarations: [
    AttendanceComponent
  ],
  imports: [
    CommonModule,
    AttendanceRoutingModule,

    AdminSharedModule,
  ]
})
export class AttendanceModule { }
