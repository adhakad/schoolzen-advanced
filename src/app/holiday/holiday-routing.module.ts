import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HolidaysComponent } from './holidays/holidays.component';
import { HolidayTemplatesComponent } from './templates/templates.component';
import { HolidayAssignComponent } from './assign/assign.component';

// Mounted by v2-routing.module.ts at /v2/holiday — matches the sidebar's links.
const routes: Routes = [
  { path: '', redirectTo: 'holidays', pathMatch: 'full' },
  { path: 'holidays', component: HolidaysComponent },
  { path: 'templates', component: HolidayTemplatesComponent },
  { path: 'assign', component: HolidayAssignComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class HolidayRoutingModule {}
