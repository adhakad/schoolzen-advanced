import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminFeesReminderComponent } from './admin-fees-reminder.component';

const routes: Routes = [{ path: '', component: AdminFeesReminderComponent }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminFeesReminderRoutingModule { }
