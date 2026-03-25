import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TeacherStudentFeesStructureComponent } from './teacher-student-fees-structure.component';

const routes: Routes = [
  { path: '', component: TeacherStudentFeesStructureComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TeacherStudentFeesStructureRoutingModule { }
