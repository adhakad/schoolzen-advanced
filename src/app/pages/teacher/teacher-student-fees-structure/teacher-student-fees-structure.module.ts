import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherStudentFeesStructureRoutingModule } from './teacher-student-fees-structure-routing.module';
import { TeacherStudentFeesStructureComponent } from './teacher-student-fees-structure.component';
import { TeacherSharedModule } from '../teacher-shared/teacher-shared.module';


@NgModule({
  declarations: [
    TeacherStudentFeesStructureComponent
  ],
  imports: [
    CommonModule,
    TeacherStudentFeesStructureRoutingModule,
    TeacherSharedModule
  ]
})
export class TeacherStudentFeesStructureModule { }
