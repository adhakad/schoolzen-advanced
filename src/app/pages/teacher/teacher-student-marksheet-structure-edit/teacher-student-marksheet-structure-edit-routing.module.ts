import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TeacherStudentMarksheetStructureEditComponent } from './teacher-student-marksheet-structure-edit.component';

const routes: Routes = [
  { path: '', component: TeacherStudentMarksheetStructureEditComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TeacherStudentMarksheetStructureEditRoutingModule { }
