import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderNavModule } from '../common/header-nav/header-nav.module';
import { SideNavModule } from '../common/side-nav/side-nav.module';
import { MaterialUiModule } from 'src/app/material/material-ui/material-ui.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PaginationModule } from '../../pagination/pagination.module';
import { PortalModule } from '@angular/cdk/portal';
import { MatMomentDatetimeModule } from '@mat-datetimepicker/moment';
import { MatDatetimepickerModule } from '@mat-datetimepicker/core';
import { NgxMatFileInputModule } from '@angular-material-components/file-input';
import { RoundProgressModule } from 'angular-svg-round-progressbar';
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
    PortalModule,
    RoundProgressModule,
    MatMomentDatetimeModule,
    MatDatetimepickerModule,
    NgxMatFileInputModule,
    SharedPipeModule
  ]
})
export class TeacherSharedModule { }
