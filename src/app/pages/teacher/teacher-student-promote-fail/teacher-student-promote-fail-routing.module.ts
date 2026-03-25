import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TeacherStudentPromoteFailComponent } from './teacher-student-promote-fail.component';

const routes: Routes = [
  { path: '', component: TeacherStudentPromoteFailComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TeacherStudentPromoteFailRoutingModule { }
