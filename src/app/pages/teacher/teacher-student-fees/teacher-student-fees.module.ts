import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherStudentFeesRoutingModule } from './teacher-student-fees-routing.module';
import { TeacherStudentFeesComponent } from './teacher-student-fees.component';
import { TeacherSharedModule } from '../teacher-shared/teacher-shared.module';


@NgModule({
  declarations: [
    TeacherStudentFeesComponent
  ],
  imports: [
    CommonModule,
    TeacherStudentFeesRoutingModule,
    TeacherSharedModule
  ]
})
export class TeacherStudentFeesModule { }
