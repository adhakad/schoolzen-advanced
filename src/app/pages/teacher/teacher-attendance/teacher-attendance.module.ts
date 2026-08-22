import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherAttendanceRoutingModule } from './teacher-attendance-routing.module';
import { TeacherSharedModule } from '../teacher-shared/teacher-shared.module';
import { TeacherAttendanceComponent } from './teacher-attendance.component';


@NgModule({
  declarations: [
    TeacherAttendanceComponent
  ],
  imports: [
    CommonModule,
    TeacherAttendanceRoutingModule,
    TeacherSharedModule
  ]
})
export class TeacherAttendanceModule { }
