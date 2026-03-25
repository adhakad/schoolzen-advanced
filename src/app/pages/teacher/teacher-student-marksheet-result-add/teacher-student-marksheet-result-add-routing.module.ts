import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TeacherStudentMarksheetResultAddComponent } from './teacher-student-marksheet-result-add.component';

const routes: Routes = [
  { path: '', component: TeacherStudentMarksheetResultAddComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TeacherStudentMarksheetResultAddRoutingModule { }
