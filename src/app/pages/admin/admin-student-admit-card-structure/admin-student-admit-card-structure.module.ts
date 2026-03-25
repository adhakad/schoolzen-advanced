import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AdminStudentAdmitCardStructureRoutingModule } from './admin-student-admit-card-structure-routing.module';
import { AdminStudentAdmitCardStructureComponent } from './admin-student-admit-card-structure.component';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';

@NgModule({
  declarations: [
    AdminStudentAdmitCardStructureComponent,
  ],
  imports: [
    CommonModule,
    AdminStudentAdmitCardStructureRoutingModule,
    AdminSharedModule
  ]
})
export class AdminStudentAdmitCardStructureModule { }
