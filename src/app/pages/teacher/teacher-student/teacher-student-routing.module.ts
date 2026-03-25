import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TeacherStudentComponent } from './teacher-student.component';

const routes: Routes = [
  { path: '', component: TeacherStudentComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TeacherStudentRoutingModule { }
