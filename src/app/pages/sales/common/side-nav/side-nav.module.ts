import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SideNavComponent } from './side-nav.component';
import { MaterialUiModule } from 'src/app/material/material-ui/material-ui.module';



@NgModule({
  declarations: [
    SideNavComponent
  ],
  imports: [
    CommonModule,
    MaterialUiModule,
    RouterModule
  ],
  exports:[
    SideNavComponent
  ]
})
export class SideNavModule { }
