import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FooterComponent } from './footer.component';
import { MaterialUiModule } from 'src/app/material/material-ui/material-ui.module';
import { HomeRoutingModule } from 'src/app/pages/main/home/home-routing.module';


@NgModule({
  declarations: [
    FooterComponent
  ],
  imports: [
    CommonModule,
    MaterialUiModule,
    HomeRoutingModule,
  ],
  exports:[
    FooterComponent,
  ]
})
export class FooterModule { }
