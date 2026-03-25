import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderModule } from 'src/app/common/header/header.module';
import { MaterialUiModule } from 'src/app/material/material-ui/material-ui.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PaginationModule } from '../../pagination/pagination.module';
import { PortalModule } from '@angular/cdk/portal';
import { RoundProgressModule } from 'angular-svg-round-progressbar';
import { MatMomentDatetimeModule } from '@mat-datetimepicker/moment';
import { MatDatetimepickerModule } from '@mat-datetimepicker/core';
import { NgxMatFileInputModule } from '@angular-material-components/file-input';
import { FooterModule } from 'src/app/common/footer/footer.module';
import { SharedPipeModule } from 'src/app/pipes/shared-pipe/shared-pipe.module';




@NgModule({
  declarations: [],
  imports: [
    CommonModule,
  ],
  exports:[
    HeaderModule,
    FooterModule,
    MaterialUiModule,
    ReactiveFormsModule,
    FormsModule,
    PaginationModule,
    PortalModule,
    RoundProgressModule,
    MatMomentDatetimeModule,
    MatDatetimepickerModule,
    NgxMatFileInputModule,
    SharedPipeModule
  ]
})
export class MainSharedModule { }
