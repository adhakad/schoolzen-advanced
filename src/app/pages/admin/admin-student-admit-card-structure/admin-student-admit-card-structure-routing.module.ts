import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminStudentAdmitCardStructureComponent } from './admin-student-admit-card-structure.component';

const routes: Routes = [
  { path: '', component: AdminStudentAdmitCardStructureComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminStudentAdmitCardStructureRoutingModule { }
