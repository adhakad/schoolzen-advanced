import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ClassShiftRoutingModule } from './class-shift-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { ClassShiftComponent } from './class-shift.component';


@NgModule({
  declarations: [
    ClassShiftComponent
  ],
  imports: [
    CommonModule,
    ClassShiftRoutingModule,

    AdminSharedModule,
  ]
})
export class ClassShiftModule { }
