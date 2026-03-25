import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AdminFeesReminderRoutingModule } from './admin-fees-reminder-routing.module';
import { AdminFeesReminderComponent } from './admin-fees-reminder.component';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';


@NgModule({
  declarations: [
    AdminFeesReminderComponent
  ],
  imports: [
    CommonModule,
    AdminFeesReminderRoutingModule,
    AdminSharedModule
  ]
})
export class AdminFeesReminderModule { }
