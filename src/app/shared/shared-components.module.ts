/**
 * The R5 shared component library — build once, use everywhere.
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
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

// Angular Material is the app's one component library — the filter pills and date pickers
// are Material controls re-themed to the design system, not a second UI framework. Only
// the three modules those controls need are imported here (MatNativeDateModule supplies the
// DateAdapter the datepicker requires; the MAT_DATE_LOCALE provider in app.module.ts
// configures it app-wide).
import { MatSelectModule } from '@angular/material/select';
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
  BackLinkComponent
];

@NgModule({
  declarations: COMPONENTS,
  imports: [
    CommonModule, FormsModule, RouterModule,
    MatSelectModule, MatDatepickerModule, MatNativeDateModule
  ],
  exports: [...COMPONENTS, CommonModule, FormsModule, RouterModule]
})
export class SharedComponentsModule {}
