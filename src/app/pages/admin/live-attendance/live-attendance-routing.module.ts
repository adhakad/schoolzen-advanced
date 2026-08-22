import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LiveAttendanceComponent } from './live-attendance.component';

const routes: Routes = [
  { path: '', component: LiveAttendanceComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class LiveAttendanceRoutingModule { }
