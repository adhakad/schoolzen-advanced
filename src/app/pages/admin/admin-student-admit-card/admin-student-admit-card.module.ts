import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AdminStudentAdmitCardRoutingModule } from './admin-student-admit-card-routing.module';
import { AdminStudentAdmitCardComponent } from './admin-student-admit-card.component';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';

@NgModule({
  declarations: [
    AdminStudentAdmitCardComponent,
  ],
  imports: [
    CommonModule,
    AdminStudentAdmitCardRoutingModule,
    AdminSharedModule
  ]
})
export class AdminStudentAdmitCardModule { }
