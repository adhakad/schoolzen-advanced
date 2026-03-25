import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TeacherStudentTransferCertificateComponent } from './teacher-student-transfer-certificate.component';

const routes: Routes = [
  { path: '', component: TeacherStudentTransferCertificateComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TeacherStudentTransferCertificateRoutingModule { }
