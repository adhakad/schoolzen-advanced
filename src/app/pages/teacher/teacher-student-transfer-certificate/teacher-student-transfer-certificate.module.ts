import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherStudentTransferCertificateRoutingModule } from './teacher-student-transfer-certificate-routing.module';
import { TeacherStudentTransferCertificateComponent } from './teacher-student-transfer-certificate.component';
import { TeacherSharedModule } from '../teacher-shared/teacher-shared.module';


@NgModule({
  declarations: [
    TeacherStudentTransferCertificateComponent
  ],
  imports: [
    CommonModule,
    TeacherStudentTransferCertificateRoutingModule,
    TeacherSharedModule
  ]
})
export class TeacherStudentTransferCertificateModule { }
