import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TeacherStudentMarksheetStructureComponent } from './teacher-student-marksheet-structure.component';

const routes: Routes = [
  { path: '', component: TeacherStudentMarksheetStructureComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TeacherStudentMarksheetStructureRoutingModule { }
