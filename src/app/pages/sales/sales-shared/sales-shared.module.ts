import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderNavModule } from '../common/header-nav/header-nav.module';
import { SideNavModule } from '../common/side-nav/side-nav.module';
import { MaterialUiModule } from 'src/app/material/material-ui/material-ui.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PaginationModule } from '../../pagination/pagination.module';
import { SharedPipeModule } from 'src/app/pipes/shared-pipe/shared-pipe.module';



@NgModule({
  declarations: [],
  imports: [
    CommonModule
  ],
  exports:[
    HeaderNavModule,
    SideNavModule,

    MaterialUiModule,
    ReactiveFormsModule,
    FormsModule,
    PaginationModule,
    SharedPipeModule
  ]
})
export class SalesSharedModule { }
