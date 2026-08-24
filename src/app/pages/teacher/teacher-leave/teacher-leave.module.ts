import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherLeaveRoutingModule } from './teacher-leave-routing.module';
import { TeacherSharedModule } from '../teacher-shared/teacher-shared.module';
import { TeacherLeaveComponent } from './teacher-leave.component';


@NgModule({
  declarations: [
    TeacherLeaveComponent
  ],
  imports: [
    CommonModule,
    TeacherLeaveRoutingModule,

    TeacherSharedModule,
  ]
})
export class TeacherLeaveModule { }
