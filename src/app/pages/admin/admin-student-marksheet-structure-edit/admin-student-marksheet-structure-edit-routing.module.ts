import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminStudentMarksheetStructureEditComponent } from './admin-student-marksheet-structure-edit.component';

const routes: Routes = [
  { path: '', component: AdminStudentMarksheetStructureEditComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminStudentMarksheetStructureEditRoutingModule { }
