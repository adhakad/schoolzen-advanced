import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderNavbarComponent } from './header-navbar.component';
import { DashboardRoutingModule } from '../../dashboard/dashboard-routing.module';
import { MaterialUiModule } from 'src/app/material/material-ui/material-ui.module';



@NgModule({
  declarations: [
    HeaderNavbarComponent
  ],
  imports: [
    CommonModule,
    MaterialUiModule,
    DashboardRoutingModule
  ],
  exports: [
    HeaderNavbarComponent
  ]
})
export class HeaderNavbarModule { }
