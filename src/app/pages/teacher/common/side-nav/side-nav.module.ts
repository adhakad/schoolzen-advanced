import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SideNavComponent } from './side-nav.component';
import { MaterialUiModule } from 'src/app/material/material-ui/material-ui.module';
import { TeacherDashboardRoutingModule } from '../../teacher-dashboard/teacher-dashboard-routing.module';



@NgModule({
  declarations: [
    SideNavComponent
  ],
  imports: [
    CommonModule,
    MaterialUiModule,
    TeacherDashboardRoutingModule
  ],
  exports:[
    SideNavComponent
  ]
})
export class SideNavModule { }
