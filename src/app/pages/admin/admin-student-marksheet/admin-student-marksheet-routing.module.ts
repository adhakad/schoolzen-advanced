import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminStudentMarksheetComponent } from './admin-student-marksheet.component';

const routes: Routes = [
  { path: '', component: AdminStudentMarksheetComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminStudentMarksheetRoutingModule { }
