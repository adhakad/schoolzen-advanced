import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PaginationComponent } from './pagination.component';
import { MaterialUiModule } from 'src/app/material/material-ui/material-ui.module';



@NgModule({
  declarations: [PaginationComponent],
  imports: [
    CommonModule,
    FormsModule,
    MaterialUiModule
  ],
  exports:[
    PaginationComponent
  ]
})
export class PaginationModule { }
