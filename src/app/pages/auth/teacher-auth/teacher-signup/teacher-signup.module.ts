import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherSignupRoutingModule } from './teacher-signup-routing.module';
import { TeacherSignupComponent } from './teacher-signup.component';
import { MainSharedModule } from 'src/app/pages/main/main-shared/main-shared.module';


@NgModule({
  declarations: [
    TeacherSignupComponent
  ],
  imports: [
    CommonModule,
    TeacherSignupRoutingModule,
    MainSharedModule
  ]
})
export class TeacherSignupModule { }
