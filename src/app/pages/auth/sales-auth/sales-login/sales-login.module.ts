import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SalesLoginRoutingModule } from './sales-login-routing.module';
import { SalesLoginComponent } from './sales-login.component';
import { MainSharedModule } from 'src/app/pages/main/main-shared/main-shared.module';


@NgModule({
  declarations: [
    SalesLoginComponent
  ],
  imports: [
    CommonModule,
    SalesLoginRoutingModule,
    MainSharedModule
  ]
})
export class SalesLoginModule { }
