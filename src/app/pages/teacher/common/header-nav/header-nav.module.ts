import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderNavComponent } from './header-nav.component';
import { MaterialUiModule } from 'src/app/material/material-ui/material-ui.module';
import { TeacherDashboardRoutingModule } from '../../teacher-dashboard/teacher-dashboard-routing.module';



@NgModule({
  declarations: [
    HeaderNavComponent
  ],
  imports: [
    CommonModule,
    MaterialUiModule,
    TeacherDashboardRoutingModule
  ],
  exports:[
    HeaderNavComponent
  ]
})
export class HeaderNavModule { }
