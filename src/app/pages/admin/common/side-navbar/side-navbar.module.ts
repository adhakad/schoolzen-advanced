import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SideNavbarComponent } from './side-navbar.component';
import { DashboardRoutingModule } from '../../dashboard/dashboard-routing.module';
import { MaterialUiModule } from 'src/app/material/material-ui/material-ui.module';



@NgModule({
  declarations: [
    SideNavbarComponent
  ],
  imports: [
    CommonModule,
    MaterialUiModule,
    DashboardRoutingModule
    
  ],
  exports:[
    SideNavbarComponent
  ]
})
export class SideNavbarModule { }
