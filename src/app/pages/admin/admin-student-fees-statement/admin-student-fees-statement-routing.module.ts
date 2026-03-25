import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminStudentFeesStatementComponent } from './admin-student-fees-statement.component';

const routes: Routes = [
  { path: '', component: AdminStudentFeesStatementComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminStudentFeesStatementRoutingModule { }
