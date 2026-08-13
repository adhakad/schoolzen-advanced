import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ShiftRoutingModule } from './shift-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { ShiftComponent } from './shift.component';


@NgModule({
  declarations: [
    ShiftComponent
  ],
  imports: [
    CommonModule,
    ShiftRoutingModule,

    AdminSharedModule,
  ]
})
export class ShiftModule { }
