import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherAdmissionRoutingModule } from './teacher-admission-routing.module';
import { TeacherAdmissionComponent } from './teacher-admission.component';
import { TeacherSharedModule } from '../teacher-shared/teacher-shared.module';


@NgModule({
  declarations: [
    TeacherAdmissionComponent
  ],
  imports: [
    CommonModule,
    TeacherAdmissionRoutingModule,
    TeacherSharedModule
  ]
})
export class TeacherAdmissionModule { }
