import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminStudentFeesStructureComponent } from './admin-student-fees-structure.component';

const routes: Routes = [
  {path:'',component:AdminStudentFeesStructureComponent}
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminStudentFeesStructureRoutingModule { }
