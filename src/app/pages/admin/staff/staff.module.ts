import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { StaffRoutingModule } from './staff-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { StaffComponent } from './staff.component';


@NgModule({
  declarations: [
    StaffComponent
  ],
  imports: [
    CommonModule,
    StaffRoutingModule,

    AdminSharedModule,
  ]
})
export class StaffModule { }
