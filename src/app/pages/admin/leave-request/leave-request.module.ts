import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LeaveRequestRoutingModule } from './leave-request-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { LeaveRequestComponent } from './leave-request.component';


@NgModule({
  declarations: [
    LeaveRequestComponent
  ],
  imports: [
    CommonModule,
    LeaveRequestRoutingModule,

    AdminSharedModule,
  ]
})
export class LeaveRequestModule { }
