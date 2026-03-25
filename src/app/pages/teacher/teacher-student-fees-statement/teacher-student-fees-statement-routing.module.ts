import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TeacherStudentFeesStatementComponent } from './teacher-student-fees-statement.component';

const routes: Routes = [
  { path: '', component: TeacherStudentFeesStatementComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TeacherStudentFeesStatementRoutingModule { }
