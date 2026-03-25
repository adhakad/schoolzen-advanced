import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherRoutingModule } from './teacher-routing.module';
import { TeacherComponent } from './teacher.component';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';

@NgModule({
  declarations: [
    TeacherComponent,
  ],
  imports: [
    CommonModule,
    TeacherRoutingModule,
    AdminSharedModule,
  ]
})
export class TeacherModule { }
