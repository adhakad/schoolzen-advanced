import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TeacherSignupComponent } from './teacher-signup.component';

const routes: Routes = [
  { path: '', component: TeacherSignupComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TeacherSignupRoutingModule { }
