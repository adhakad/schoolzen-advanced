import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherDashboardRoutingModule } from './teacher-dashboard-routing.module';
import { TeacherSharedModule } from '../teacher-shared/teacher-shared.module';
import { TeacherDashboardComponent } from './teacher-dashboard.component';


@NgModule({
  declarations: [
    TeacherDashboardComponent
  ],
  imports: [
    CommonModule,
    TeacherDashboardRoutingModule,
    TeacherSharedModule
  ]
})
export class TeacherDashboardModule { }
