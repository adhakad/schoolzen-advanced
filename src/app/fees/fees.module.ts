/**
 * Fees — Fees, Fee Structure, Fee Statement, Fee Reminder (module 8).
 *
 * Routing and declarations ONLY. Services and models live in the shared layer folders
 * (shared/services/fees/, shared/models/fees/), mirroring the backend's layout.
 */
import { NgModule } from '@angular/core';
import { SharedComponentsModule } from 'src/app/shared/shared-components.module';
import { SharedPipeModule } from 'src/app/pipes/shared-pipe/shared-pipe.module';
import { FeesRoutingModule } from './fees-routing.module';
import { FeesComponent } from './fees/fees.component';
import { FeeStructureComponent } from './fee-structure/fee-structure.component';
import { FeeStatementComponent } from './fee-statement/fee-statement.component';
import { FeeReminderComponent } from './fee-reminder/fee-reminder.component';
import { FeeReceiptComponent } from './fee-receipt/fee-receipt.component';

@NgModule({
  declarations: [
    FeesComponent,
    FeeStructureComponent,
    FeeStatementComponent,
    FeeReminderComponent,
    FeeReceiptComponent
  ],
  imports: [SharedComponentsModule, SharedPipeModule, FeesRoutingModule]
})
export class FeesModule {}
