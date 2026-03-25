import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminStudentFeesComponent } from './admin-student-fees.component';


const routes: Routes = [
  { path: '', component:AdminStudentFeesComponent  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminStudentFeesRoutingModule { }
