import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LeaveTypeRoutingModule } from './leave-type-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { LeaveTypeComponent } from './leave-type.component';


@NgModule({
  declarations: [
    LeaveTypeComponent
  ],
  imports: [
    CommonModule,
    LeaveTypeRoutingModule,

    AdminSharedModule,
  ]
})
export class LeaveTypeModule { }
