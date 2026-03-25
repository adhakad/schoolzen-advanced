import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherAdmitCardRoutingModule } from './teacher-admit-card-routing.module';
import { TeacherAdmitCardComponent } from './teacher-admit-card.component';
import { TeacherSharedModule } from '../teacher-shared/teacher-shared.module';


@NgModule({
  declarations: [
    TeacherAdmitCardComponent
  ],
  imports: [
    CommonModule,
    TeacherAdmitCardRoutingModule,
    TeacherSharedModule
  ]
})
export class TeacherAdmitCardModule { }
