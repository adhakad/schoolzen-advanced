import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminStudentMarksheetResultAddComponent } from './admin-student-marksheet-result-add.component';

const routes: Routes = [
  { path: '', component: AdminStudentMarksheetResultAddComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminStudentMarksheetResultAddRoutingModule { }
