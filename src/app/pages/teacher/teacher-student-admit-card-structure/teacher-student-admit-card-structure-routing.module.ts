import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TeacherStudentAdmitCardStructureComponent } from './teacher-student-admit-card-structure.component';

const routes: Routes = [
  { path: '', component: TeacherStudentAdmitCardStructureComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TeacherStudentAdmitCardStructureRoutingModule { }
