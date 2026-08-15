import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HeaderNavComponent } from './header-nav.component';
import { MaterialUiModule } from 'src/app/material/material-ui/material-ui.module';



@NgModule({
  declarations: [
    HeaderNavComponent
  ],
  imports: [
    CommonModule,
    MaterialUiModule,
    RouterModule
  ],
  exports:[
    HeaderNavComponent
  ]
})
export class HeaderNavModule { }
