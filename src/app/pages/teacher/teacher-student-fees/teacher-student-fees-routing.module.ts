import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TeacherStudentFeesComponent } from './teacher-student-fees.component';

const routes: Routes = [
  { path: '', component: TeacherStudentFeesComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TeacherStudentFeesRoutingModule { }
