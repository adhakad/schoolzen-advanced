import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherSalaryRoutingModule } from './teacher-salary-routing.module';
import { TeacherSharedModule } from '../teacher-shared/teacher-shared.module';
import { TeacherSalaryComponent } from './teacher-salary.component';


@NgModule({
  declarations: [
    TeacherSalaryComponent
  ],
  imports: [
    CommonModule,
    TeacherSalaryRoutingModule,

    TeacherSharedModule,
  ]
})
export class TeacherSalaryModule { }
