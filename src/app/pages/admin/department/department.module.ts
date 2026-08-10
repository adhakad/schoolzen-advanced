import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { DepartmentRoutingModule } from './department-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { DepartmentComponent } from './department.component';


@NgModule({
  declarations: [
    DepartmentComponent
  ],
  imports: [
    CommonModule,
    DepartmentRoutingModule,

    AdminSharedModule,
  ]
})
export class DepartmentModule { }
