import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TeacherAdmissionComponent } from './teacher-admission.component';

const routes: Routes = [
  { path: '', component: TeacherAdmissionComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TeacherAdmissionRoutingModule { }
