import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherLoginRoutingModule } from './teacher-login-routing.module';
import { TeacherLoginComponent } from './teacher-login.component';
import { MainSharedModule } from 'src/app/pages/main/main-shared/main-shared.module';


@NgModule({
  declarations: [
    TeacherLoginComponent
  ],
  imports: [
    CommonModule,
    TeacherLoginRoutingModule,
    MainSharedModule
  ]
})
export class TeacherLoginModule { }
