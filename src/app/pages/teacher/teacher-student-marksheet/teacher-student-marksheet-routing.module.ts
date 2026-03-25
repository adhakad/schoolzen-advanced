import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TeacherStudentMarksheetComponent } from './teacher-student-marksheet.component';

const routes: Routes = [
  { path: '', component: TeacherStudentMarksheetComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TeacherStudentMarksheetRoutingModule { }
