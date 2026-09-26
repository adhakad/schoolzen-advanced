/**
 * The shared component library — build once, use everywhere.
 *
 * Every module page assembles these components with its own data rather than re-writing
 * the shell/toolbar/table markup, which is what keeps 13 modules visually and behaviourally
 * identical without 13 separate design reviews. Changing one of these components after
 * modules consume it is a breaking change to everything built so far: add a new @Input()
 * rather than repurposing an existing one.
 *
 * Unlike the older *-shared barrels, this module also exports CommonModule and
 * RouterModule, so a feature module importing it does not have to remember to import
 * them itself for *ngIf/*ngFor/routerLink.
 */
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

// Angular Material supplies the DATE PICKER only. Every select-like control is app-dd:
// design-system.md bans native selects, and a re-themed <mat-select> is still not the
// `.dd` markup the references show, so MatSelectModule is deliberately gone. MatNativeDateModule
// supplies the DateAdapter the datepicker requires; the MAT_DATE_LOCALE provider in
// app.module.ts configures it app-wide.
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';

import { PageShellComponent } from './components/page-shell/page-shell.component';
import { ShellHeaderComponent } from './components/page-shell/shell-header/shell-header.component';
import { ShellSidebarComponent } from './components/page-shell/shell-sidebar/shell-sidebar.component';
import { SummaryStripComponent } from './components/summary-strip/summary-strip.component';
import { DataToolbarComponent } from './components/data-toolbar/data-toolbar.component';
import { DataTableComponent } from './components/data-table/data-table.component';
import { StatusChipComponent } from './components/status-chip/status-chip.component';
import { RowAvatarComponent } from './components/row-avatar/row-avatar.component';
import { IconActionComponent } from './components/icon-action/icon-action.component';
import { ConfirmModalComponent } from './components/confirm-modal/confirm-modal.component';
import { BackLinkComponent } from './components/back-link/back-link.component';
import { FormModalComponent } from './components/form-modal/form-modal.component';
import { CountPillComponent } from './components/count-pill/count-pill.component';
import { ToggleSwitchComponent } from './components/toggle-switch/toggle-switch.component';
import { InlineListEditorComponent } from './components/inline-list-editor/inline-list-editor.component';
import { DdComponent } from './components/dd/dd.component';
import { PaginationBarComponent } from './components/pagination-bar/pagination-bar.component';
import { ClassCascadeFilterComponent } from './components/class-cascade-filter/class-cascade-filter.component';
import { LetterheadDocumentComponent } from './components/letterhead-document/letterhead-document.component';
import { StudentProfileViewComponent } from './components/student-profile-view/student-profile-view.component';
import { StudentFormComponent } from './components/student-form/student-form.component';

const COMPONENTS = [
  PageShellComponent,
  ShellHeaderComponent,
  ShellSidebarComponent,
  SummaryStripComponent,
  DataToolbarComponent,
  DataTableComponent,
  StatusChipComponent,
  RowAvatarComponent,
  IconActionComponent,
  ConfirmModalComponent,
  BackLinkComponent,
  FormModalComponent,
  CountPillComponent,
  ToggleSwitchComponent,
  InlineListEditorComponent,
  DdComponent,
  PaginationBarComponent,
  // Built for the Student module, reused by every later module that needs them: the class
  // cascade filter (Fees, Examination, Certificates), the letterhead (every printable
  // document), and the student form/profile view.
  ClassCascadeFilterComponent,
  LetterheadDocumentComponent,
  StudentProfileViewComponent,
  StudentFormComponent
];

@NgModule({
  declarations: COMPONENTS,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, RouterModule,
    MatDatepickerModule, MatNativeDateModule
  ],
  // app-dd is exported with the rest: a module page's own form (the Add/Edit modal's
  // Class Name field) uses the same dropdown component the toolbar's filter pills do.
  exports: [...COMPONENTS, CommonModule, FormsModule, ReactiveFormsModule, RouterModule]
})
export class SharedComponentsModule {}
