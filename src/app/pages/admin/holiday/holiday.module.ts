import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { HolidayRoutingModule } from './holiday-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { HolidayComponent } from './holiday.component';


@NgModule({
  declarations: [
    HolidayComponent
  ],
  imports: [
    CommonModule,
    HolidayRoutingModule,

    AdminSharedModule,
  ]
})
export class HolidayModule { }
