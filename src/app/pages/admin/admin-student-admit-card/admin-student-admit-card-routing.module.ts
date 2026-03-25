import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminStudentAdmitCardComponent } from './admin-student-admit-card.component';

const routes: Routes = [
  { path: '', component: AdminStudentAdmitCardComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminStudentAdmitCardRoutingModule { }
