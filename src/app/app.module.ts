import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AdminAuthInterceptor } from './interceptors/admin-auth.interceptor';
import { TeacherAuthInterceptor } from './interceptors/teacher-auth.interceptor';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { PortalModule } from '@angular/cdk/portal';
// import { ScrollingModule } from '@angular/cdk/scrolling';
import { ReactiveFormsModule } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { MaterialUiModule } from './material/material-ui/material-ui.module';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { RoundProgressModule } from 'angular-svg-round-progressbar';
import { MatMomentDatetimeModule } from '@mat-datetimepicker/moment';
import { MatDatetimepickerModule, MAT_DATETIME_FORMATS } from '@mat-datetimepicker/core';
import { MAT_DATE_LOCALE } from '@angular/material/core';

import { NgxMatFileInputModule } from '@angular-material-components/file-input';
import { AdminSharedModule } from './pages/admin/admin-shared/admin-shared.module';
import { TeacherSharedModule } from './pages/teacher/teacher-shared/teacher-shared.module';
import { MainSharedModule } from './pages/main/main-shared/main-shared.module';
import { ToastrModule } from 'ngx-toastr';

@NgModule({
  declarations: [
    AppComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    ToastrModule.forRoot({
      timeOut: 5000,
      positionClass: 'toast-top-right',
      closeButton: true
      // preventDuplicates: true,
      // progressBar: true
    }),
    HttpClientModule,
    ReactiveFormsModule,
    FormsModule,
    RoundProgressModule,
    PortalModule,
    MaterialUiModule,
    MatMomentDatetimeModule,
    MatDatetimepickerModule,
    NgxMatFileInputModule,
    // MatNativeDateModule,
    MainSharedModule,
    AdminSharedModule,
    TeacherSharedModule,
  ],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: AdminAuthInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: TeacherAuthInterceptor, multi: true },
    {provide: MAT_DATE_LOCALE, useValue: 'en-GB'},
    {
      provide: MAT_DATETIME_FORMATS,
      useValue: {
        parse: {
          dateInput: 'L',
          monthInput: 'MMMM',
          timeInput: 'LT',
          datetimeInput: 'L LT',
        },
        display: {
          dateInput: 'L',
          monthInput: 'MMMM',
          datetimeInput: 'L LT',
          timeInput: 'LT',
          monthYearLabel: 'MMM YYYY',
          dateA11yLabel: 'LL',
          monthYearA11yLabel: 'MMMM YYYY',
          popupHeaderDateLabel: 'ddd, DD MMM',
        },
      },
    },
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }