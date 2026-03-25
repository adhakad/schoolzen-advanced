import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AdminForgotRoutingModule } from './admin-forgot-routing.module';
import { AdminForgotComponent } from './admin-forgot.component';
import { MainSharedModule } from 'src/app/pages/main/main-shared/main-shared.module';


@NgModule({
  declarations: [
    AdminForgotComponent
  ],
  imports: [
    CommonModule,
    AdminForgotRoutingModule,
    MainSharedModule
  ]
})
export class AdminForgotModule { }
