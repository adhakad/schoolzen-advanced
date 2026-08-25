import { Component, OnInit } from '@angular/core';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ClassShiftService } from 'src/app/services/class-shift.service';
import { LeaveAssignmentService } from 'src/app/services/leave-assignment.service';
import { ToastrService } from 'ngx-toastr';

// HOW MANY DAYS OF EACH LEAVE A PERSON GETS IN A YEAR.
//
// A settings page, deliberately separate from the approvals queue it feeds. Setting limits is
// a once-a-year job for the office; approving requests is a daily one — the two were tabs on
// a single screen and the crowding made both harder to read.
//
// It is also the gate on approval, not merely a convenience: ApproveLeaveRequest refuses a
// request whose person has no entitlement row for that leave type, so a limit set here is
// what makes an approval possible at all.
//
// Assigning is idempotent server-side. Somebody who already has the type is SKIPPED, never
// reset, so re-running the same selection cannot wipe the days they have already taken — the
// toast reports both counts for exactly that reason.
@Component({
  selector: 'app-leave-limit',
  templateUrl: './leave-limit.component.html',
  styleUrls: ['./leave-limit.component.css']
})
export class LeaveLimitComponent implements OnInit {
  adminId!: string;
  loader: Boolean = true;

  personType: string = 'staff';
  selectedClass: string = '';
  classOptions: String[] = [];

  leaveTypes: any[] = [];
  rows: any[] = [];
  gridLoading: boolean = false;

  // Person ids, not whole rows: the grid is re-fetched after every save and object identity
  // would not survive it.
  selectedPersonIds: Set<string> = new Set<string>();

  showModal: boolean = false;
  assignTypeIds: Set<string> = new Set<string>();

  // Double-submit guard
  isClick: boolean = false;

  constructor(
    private toastr: ToastrService,
    private adminAuthService: AdminAuthService,
    private classShiftService: ClassShiftService,
    private leaveAssignmentService: LeaveAssignmentService,
  ) { }

  ngOnInit(): void {
    const admin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = admin?.id;
    this.getClassOptions();
    this.getGrid();
    setTimeout(() => { this.loader = false; }, 1000);
  }

  getClassOptions(): void {
    this.classShiftService.getClassOptions(this.adminId).subscribe(
      (res: any) => { this.classOptions = res || []; },
      () => { this.classOptions = []; }
    );
  }

  // Switching the person type invalidates the columns as well as the rows: a leave type
  // restricted to students is not a column on the staff grid.
  switchPersonType(): void {
    this.selectedClass = '';
    this.rows = [];
    this.leaveTypes = [];
    this.selectedPersonIds.clear();
    if (this.personType !== 'student') this.getGrid();
  }

  onClassChange(): void {
    this.rows = [];
    this.selectedPersonIds.clear();
    if (this.selectedClass) this.getGrid();
  }

  getGrid(): void {
    // The backend 400s on a student grid with no class, so don't ask for one.
    if (this.personType === 'student' && !this.selectedClass) return;

    const params: any = { adminId: this.adminId, personType: this.personType };
    if (this.personType === 'student') params.class = this.selectedClass;

    this.gridLoading = true;
    this.leaveAssignmentService.getLeaveAssignmentGrid(params).subscribe(
      (res: any) => {
        this.leaveTypes = (res && res.leaveTypes) || [];
        this.rows = (res && res.rows) || [];
        // Anyone selected who is no longer on the grid is dropped, or a save could silently
        // include somebody the admin cannot see.
        const visible = new Set(this.rows.map((row: any) => String(row.personId)));
        this.selectedPersonIds.forEach((id: string) => {
          if (!visible.has(id)) this.selectedPersonIds.delete(id);
        });
        this.gridLoading = false;
      },
      (err: any) => {
        this.leaveTypes = [];
        this.rows = [];
        this.gridLoading = false;
        this.toastr.error('', err.error || 'Could not load leave limits.');
      }
    );
  }

  // ---- Selection ----------------------------------------------------------

  isRowSelected(personId: string): boolean {
    return this.selectedPersonIds.has(String(personId));
  }

  toggleRow(personId: string): void {
    const id = String(personId);
    if (this.selectedPersonIds.has(id)) this.selectedPersonIds.delete(id);
    else this.selectedPersonIds.add(id);
  }

  get allSelected(): boolean {
    return this.rows.length > 0 && this.selectedPersonIds.size === this.rows.length;
  }

  toggleAll(): void {
    if (this.allSelected) this.selectedPersonIds.clear();
    else this.rows.forEach((row: any) => this.selectedPersonIds.add(String(row.personId)));
  }

  get selectedCount(): number {
    return this.selectedPersonIds.size;
  }

  // ---- Cells --------------------------------------------------------------

  cellOf(row: any, leaveTypeId: any): any {
    return (row && row.balances) ? row.balances[String(leaveTypeId)] : null;
  }

  cellRemaining(cell: any): number {
    if (!cell) return 0;
    return Math.max(0, Number(cell.allocated) - Number(cell.used));
  }

  // ---- Saving -------------------------------------------------------------

  closeModal(): void {
    this.showModal = false;
    this.assignTypeIds.clear();
    this.isClick = false;
  }

  openAssignModel(): void {
    if (this.selectedCount === 0) return;
    this.assignTypeIds.clear();
    this.showModal = true;
    this.isClick = false;
  }

  isTypeChecked(leaveTypeId: any): boolean {
    return this.assignTypeIds.has(String(leaveTypeId));
  }

  toggleAssignType(leaveTypeId: any): void {
    const id = String(leaveTypeId);
    if (this.assignTypeIds.has(id)) this.assignTypeIds.delete(id);
    else this.assignTypeIds.add(id);
  }

  assignSelected(): void {
    if (this.assignTypeIds.size === 0 || this.selectedCount === 0 || this.isClick) return;
    this.isClick = true;

    const persons = [...this.selectedPersonIds].map((personId: string) => ({
      personType: this.personType,
      personId: personId,
    }));
    this.sendAssign([...this.assignTypeIds], persons, true);
  }

  // The per-cell "Set" link. Same endpoint as the modal with a selection of one — there is no
  // second code path to keep in step.
  assignOne(row: any, leaveTypeId: any): void {
    if (this.isClick) return;
    this.isClick = true;
    this.sendAssign(
      [String(leaveTypeId)],
      [{ personType: this.personType, personId: String(row.personId) }],
      false,
    );
  }

  private sendAssign(leaveTypeIds: string[], persons: any[], fromModal: boolean): void {
    this.leaveAssignmentService.bulkAssignLeave({
      adminId: this.adminId,
      leaveTypeIds: leaveTypeIds,
      persons: persons,
    }).subscribe(
      (res: any) => {
        this.isClick = false;
        if (fromModal) {
          this.closeModal();
          this.selectedPersonIds.clear();
        }
        this.getGrid();
        // The skipped count matters: without it a second run looks like it did nothing, and
        // the admin cannot tell "already set" from "the button is broken".
        const assigned = res ? res.assignedCount : 0;
        const skipped = res ? res.skippedCount : 0;
        setTimeout(() => {
          this.toastr.success('', `Leave limit set for ${assigned} people. ${skipped} already had it.`);
        }, 500)
      },
      (err: any) => {
        this.isClick = false;
        this.toastr.error('', err.error || 'Could not set the leave limit.');
      }
    );
  }
}
