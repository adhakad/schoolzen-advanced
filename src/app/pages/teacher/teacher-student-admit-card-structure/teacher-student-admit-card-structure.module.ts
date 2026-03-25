import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherStudentAdmitCardStructureRoutingModule } from './teacher-student-admit-card-structure-routing.module';
import { TeacherStudentAdmitCardStructureComponent } from './teacher-student-admit-card-structure.component';
import { TeacherSharedModule } from '../teacher-shared/teacher-shared.module';


@NgModule({
  declarations: [
    TeacherStudentAdmitCardStructureComponent
  ],
  imports: [
    CommonModule,
    TeacherStudentAdmitCardStructureRoutingModule,
    TeacherSharedModule
  ]
})
export class TeacherStudentAdmitCardStructureModule { }
