import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminStudentMarksheetStructureComponent } from './admin-student-marksheet-structure.component';

const routes: Routes = [
  { path: '', component: AdminStudentMarksheetStructureComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminStudentMarksheetStructureRoutingModule { }
