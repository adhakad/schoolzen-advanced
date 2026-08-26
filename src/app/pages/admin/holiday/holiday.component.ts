import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { SchoolService } from 'src/app/services/school.service';
import { HolidayService } from 'src/app/services/holiday.service';
import { HolidayTemplateService } from 'src/app/services/holiday-template.service';
import { HolidayAssignmentService } from 'src/app/services/holiday-assignment.service';

// EVERYTHING HOLIDAY-RELATED ON ONE PAGE, behind one sidebar entry.
//
// Three tabs — Holidays, Templates, Assign — because the three are one job done in order:
// declare the days, bundle them into a year, hand that year to people. Splitting them into
// three sidebar entries (the way Leave is split) would make the second and third steps look
// optional, when in fact a Holiday reaches nobody until it has been through both.
//
// The tabs are plain buttons with an .active class, not mat-tab: no tab component is used
// anywhere else in this app, and the pill toggle in roster.component.css is the closest
// thing the design language already has.
@Component({
  selector: 'app-holiday',
  templateUrl: './holiday.component.html',
  styleUrls: ['./holiday.component.css']
})
export class HolidayComponent implements OnInit {
  adminId!: string;
  loader: Boolean = true;
  activeTab: string = 'holidays';

  // The datepickers open here rather than on some arbitrary past month.
  today: Date = new Date();

  // ---- Holidays tab -------------------------------------------------------
  holidayForm: FormGroup;
  holidayInfo: any[] = [];
  filters: any = {};
  recordLimit: number = 5;
  number: number = 0;
  paginationValues: Subject<any> = new Subject();

  showModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';

  // ---- Templates tab ------------------------------------------------------
  templateForm: FormGroup;
  templateInfo: any[] = [];
  templateFilters: any = {};
  templateRecordLimit: number = 5;
  templateNumber: number = 0;
  templatePaginationValues: Subject<any> = new Subject();

  // Every holiday this school has declared — the checklist the create/edit modal offers.
  allHolidays: any[] = [];
  // Ids, not whole rows: the list is re-fetched after every save and object identity would
  // not survive it. Same reasoning as leave-limit's selectedPersonIds.
  selectedHolidayIds: Set<string> = new Set<string>();

  showTemplateModal: boolean = false;
  templateUpdateMode: boolean = false;
  templateDeleteMode: boolean = false;
  templateDeleteById: String = '';

  // ---- Generate from the state-wise public holiday preset ------------------
  showGenerateModal: boolean = false;
  generateForm: FormGroup;
  publicStates: any[] = [];
  publicStatesLoading: boolean = false;

  // ---- Assign tab ---------------------------------------------------------
  assignPersonType: string = 'staff';
  assignRows: any[] = [];
  assignTemplates: any[] = [];
  assignTemplateId: string = '';
  gridLoading: boolean = false;
  selectedPersonIds: Set<string> = new Set<string>();

  // Edit one row. The template dropdown and Save stay dead until the confirmation box is
  // ticked — a live assignment decides whether a whole class is marked Absent or Holiday,
  // and a stray click should not be able to change that.
  showEditModal: boolean = false;
  editRow: any = null;
  editTemplateId: string = '';
  confirmChecked: boolean = false;

  // ---- Shared modal state -------------------------------------------------
  errorCheck: Boolean = false;
  errorMsg: String = '';
  successMsg: String = '';
  // Double-submit guard
  isClick: boolean = false;

  constructor(
    private fb: FormBuilder,
    private toastr: ToastrService,
    private adminAuthService: AdminAuthService,
    private schoolService: SchoolService,
    private holidayService: HolidayService,
    private holidayTemplateService: HolidayTemplateService,
    private holidayAssignmentService: HolidayAssignmentService,
  ) {
    this.holidayForm = this.fb.group({
      _id: [''],
      adminId: [''],
      name: ['', Validators.required],
      // Both controls feed one mat-date-range-input, which is what highlights the days
      // between them in the calendar. A single-day holiday simply has the same date twice.
      startDate: [null, Validators.required],
      endDate: [null, Validators.required],
    });

    this.templateForm = this.fb.group({
      _id: [''],
      adminId: [''],
      name: ['', Validators.required],
    });

    this.generateForm = this.fb.group({
      state: ['', Validators.required],
      year: [new Date().getFullYear(), Validators.required],
      // The school names its own template. Never derived from the preset — after generating,
      // this is an ordinary template they will edit for years.
      templateName: ['', Validators.required],
    });
  }

  ngOnInit(): void {
    const admin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = admin?.id;
    let load: any = this.getHoliday({ page: 1 });
    if (load) {
      setTimeout(() => {
        this.loader = false;
      }, 1000);
    }
  }

  // ---- Tabs ---------------------------------------------------------------

  // Each tab loads its own data on arrival rather than all three loading up front: the
  // assign grid is a whole school's roll and there is no reason to fetch it for somebody who
  // only came here to add Diwali.
  switchTab(tab: string): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.closeModal();

    if (tab === 'holidays') {
      this.getHoliday({ page: 1 });
    } else if (tab === 'templates') {
      this.getAllHolidays();
      this.getHolidayTemplate({ page: 1 });
    } else if (tab === 'assign') {
      this.getAssignGrid();
    }
  }

  // =========================================================================
  // HOLIDAYS TAB
  // =========================================================================

  getHoliday($event: any) {
    return new Promise((resolve, reject) => {
      let params: any = {
        filters: {},
        page: $event.page,
        limit: $event.limit ? $event.limit : this.recordLimit,
        adminId: this.adminId,
      };
      this.recordLimit = params.limit;
      if (this.filters.searchText) {
        params["filters"]["searchText"] = this.filters.searchText.trim();
      }

      this.holidayService.holidayPaginationList(params).subscribe((res: any) => {
        if (res) {
          this.holidayInfo = res.holidayList;
          this.number = params.page;
          this.paginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countHoliday });
          return resolve(true);
        }
      });
    });
  }

  addHolidayModel(): void {
    this.showModal = true;
    this.updateMode = false;
    this.deleteMode = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    this.holidayForm.reset({ _id: '', adminId: '', name: '', startDate: null, endDate: null });
  }

  updateHolidayModel(holiday: any): void {
    this.showModal = true;
    this.updateMode = true;
    this.deleteMode = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    this.holidayForm.patchValue({
      _id: holiday._id,
      adminId: holiday.adminId,
      name: holiday.name,
      // Seeded from the date KEYS, parsed as local dates. Handing the picker the raw
      // UTC-midnight ISO string would render as the previous day for anyone west of UTC.
      startDate: this.fromDateKey(holiday.startDateKey),
      endDate: this.fromDateKey(holiday.endDateKey),
    });
  }

  deleteHolidayModel(id: String): void {
    this.showModal = true;
    this.updateMode = false;
    this.deleteMode = true;
    this.deleteById = id;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
  }

  holidayAddUpdate(): void {
    if (this.holidayForm.valid) {
      if (this.isClick) {
        return;
      }
      this.errorCheck = false;
      this.errorMsg = '';
      this.isClick = true;

      const payload: any = {
        _id: this.holidayForm.value._id,
        adminId: this.adminId,
        name: this.holidayForm.value.name,
        startDate: this.toDateKey(this.holidayForm.value.startDate),
        endDate: this.toDateKey(this.holidayForm.value.endDate),
      };

      if (this.updateMode) {
        this.holidayService.updateHoliday(payload).subscribe((res: any) => {
          if (res) {
            this.isClick = false;
            this.successDone(res);
          }
        }, err => {
          this.errorCheck = true;
          this.errorMsg = err.error;
          this.isClick = false;
        })
      } else {
        this.holidayService.addHoliday(payload).subscribe((res: any) => {
          if (res) {
            this.isClick = false;
            this.successDone(res);
          }
        }, err => {
          this.errorCheck = true;
          this.errorMsg = err.error;
          this.isClick = false;
        })
      }
    }
  }

  holidayDelete(id: String): void {
    if (this.isClick) {
      return;
    }
    this.isClick = true;
    this.holidayService.deleteHoliday(id).subscribe((res: any) => {
      if (res) {
        this.isClick = false;
        this.successDone(res);
        this.deleteById = '';
      }
    }, err => {
      this.errorCheck = true;
      this.errorMsg = err.error;
      this.isClick = false;
    })
  }

  // Live count under the pickers, so the range reads as "3 days" before it is saved rather
  // than only after the table renders it. Calendar days, not working days — a holiday that
  // covers a Sunday still covers it.
  get plannedDays(): number {
    const from = this.holidayForm.value.startDate;
    const to = this.holidayForm.value.endDate;
    if (!from || !to) return 0;
    const start = new Date(from);
    const end = new Date(to);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;

    const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.round((endUtc - startUtc) / (24 * 60 * 60 * 1000)) + 1;
  }

  // =========================================================================
  // TEMPLATES TAB
  // =========================================================================

  getAllHolidays(): void {
    this.holidayService.getHolidayList(this.adminId).subscribe(
      (res: any) => { this.allHolidays = res || []; },
      () => { this.allHolidays = []; }
    );
  }

  getHolidayTemplate($event: any) {
    return new Promise((resolve, reject) => {
      let params: any = {
        filters: {},
        page: $event.page,
        limit: $event.limit ? $event.limit : this.templateRecordLimit,
        adminId: this.adminId,
      };
      this.templateRecordLimit = params.limit;
      if (this.templateFilters.searchText) {
        params["filters"]["searchText"] = this.templateFilters.searchText.trim();
      }

      this.holidayTemplateService.holidayTemplatePaginationList(params).subscribe((res: any) => {
        if (res) {
          this.templateInfo = res.holidayTemplateList;
          this.templateNumber = params.page;
          this.templatePaginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countHolidayTemplate });
          return resolve(true);
        }
      });
    });
  }

  addTemplateModel(): void {
    this.showTemplateModal = true;
    this.templateUpdateMode = false;
    this.templateDeleteMode = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    this.selectedHolidayIds.clear();
    this.templateForm.reset({ _id: '', adminId: '', name: '' });
  }

  updateTemplateModel(template: any): void {
    this.showTemplateModal = true;
    this.templateUpdateMode = true;
    this.templateDeleteMode = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    this.templateForm.patchValue({
      _id: template._id,
      adminId: template.adminId,
      name: template.name,
    });
    this.selectedHolidayIds.clear();
    for (const holidayId of (template.holidayIds || [])) {
      this.selectedHolidayIds.add(String(holidayId));
    }
  }

  deleteTemplateModel(id: String): void {
    this.showTemplateModal = true;
    this.templateUpdateMode = false;
    this.templateDeleteMode = true;
    this.templateDeleteById = id;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
  }

  isHolidayChecked(holidayId: any): boolean {
    return this.selectedHolidayIds.has(String(holidayId));
  }

  toggleHoliday(holidayId: any): void {
    const id = String(holidayId);
    if (this.selectedHolidayIds.has(id)) this.selectedHolidayIds.delete(id);
    else this.selectedHolidayIds.add(id);
  }

  templateAddUpdate(): void {
    if (this.templateForm.valid) {
      if (this.isClick) {
        return;
      }
      this.errorCheck = false;
      this.errorMsg = '';
      this.isClick = true;

      const payload: any = {
        _id: this.templateForm.value._id,
        adminId: this.adminId,
        name: this.templateForm.value.name,
        holidayIds: [...this.selectedHolidayIds],
      };

      if (this.templateUpdateMode) {
        this.holidayTemplateService.updateHolidayTemplate(payload).subscribe((res: any) => {
          if (res) {
            this.isClick = false;
            this.templateSuccessDone(res);
          }
        }, err => {
          this.errorCheck = true;
          this.errorMsg = err.error;
          this.isClick = false;
        })
      } else {
        this.holidayTemplateService.addHolidayTemplate(payload).subscribe((res: any) => {
          if (res) {
            this.isClick = false;
            this.templateSuccessDone(res);
          }
        }, err => {
          this.errorCheck = true;
          this.errorMsg = err.error;
          this.isClick = false;
        })
      }
    }
  }

  templateDelete(id: String): void {
    if (this.isClick) {
      return;
    }
    this.isClick = true;
    this.holidayTemplateService.deleteHolidayTemplate(id).subscribe((res: any) => {
      if (res) {
        this.isClick = false;
        this.templateSuccessDone(res);
        this.templateDeleteById = '';
      }
    }, err => {
      // The backend refuses while people are still assigned, and says how many. That is the
      // message worth showing, not a generic failure.
      this.errorCheck = true;
      this.errorMsg = err.error;
      this.isClick = false;
    })
  }

  // ---- Generate from the public holiday preset ----------------------------

  openGenerateModel(): void {
    this.showGenerateModal = true;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    const year = new Date().getFullYear();
    this.generateForm.reset({ state: '', year: year, templateName: '' });
    this.getPublicStates(year);
    this.prefillStateFromSchool();
  }

  getPublicStates(year: number): void {
    this.publicStatesLoading = true;
    this.holidayTemplateService.getPublicHolidayStates(year).subscribe(
      (res: any) => {
        this.publicStates = res || [];
        this.publicStatesLoading = false;
      },
      () => {
        this.publicStates = [];
        this.publicStatesLoading = false;
      }
    );
  }

  onGenerateYearChange(): void {
    // A different year is a different preset document, so the state list has to be re-read —
    // 2026 may be filled in for three states and 2027 for none.
    this.generateForm.patchValue({ state: '' });
    const year = Number(this.generateForm.value.year);
    if (year) this.getPublicStates(year);
  }

  // The school already told us its state when it was set up; making the admin pick it again
  // is a question we know the answer to. Matched case-insensitively because the school
  // profile is free text while the preset uses a fixed key.
  private prefillStateFromSchool(): void {
    this.schoolService.getSchool(this.adminId).subscribe(
      (res: any) => {
        const state = res && res.state ? String(res.state).trim() : '';
        if (!state) return;
        const match = this.publicStates.find(
          (option: any) => String(option.state).toLowerCase() === state.toLowerCase()
        );
        if (match) this.generateForm.patchValue({ state: match.state });
      },
      () => { /* no profile state is not an error — the admin just picks one */ }
    );
  }

  generateFromPublic(): void {
    if (!this.generateForm.valid || this.isClick) return;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = true;

    this.holidayTemplateService.generateFromPublic({
      adminId: this.adminId,
      state: this.generateForm.value.state,
      year: Number(this.generateForm.value.year),
      templateName: this.generateForm.value.templateName,
    }).subscribe((res: any) => {
      if (res) {
        this.isClick = false;
        this.showGenerateModal = false;
        // Both lists changed: the holidays are new rows on tab 1 and the template is a new
        // row here. Refetching both is what makes the result visible without a reload.
        this.getAllHolidays();
        this.getHolidayTemplate({ page: 1 });
        setTimeout(() => {
          this.toastr.success('', res);
        }, 500)
      }
    }, err => {
      this.errorCheck = true;
      this.errorMsg = err.error;
      this.isClick = false;
    })
  }

  // =========================================================================
  // ASSIGN TAB
  // =========================================================================

  // Switching scope invalidates the rows and the selection together: a staff _id means
  // nothing on a grid of classes.
  switchAssignPersonType(): void {
    this.assignRows = [];
    this.selectedPersonIds.clear();
    this.assignTemplateId = '';
    this.getAssignGrid();
  }

  getAssignGrid(): void {
    const params: any = { adminId: this.adminId, personType: this.assignPersonType };
    this.gridLoading = true;
    this.holidayAssignmentService.getHolidayAssignmentGrid(params).subscribe(
      (res: any) => {
        this.assignTemplates = (res && res.templates) || [];
        this.assignRows = (res && res.rows) || [];
        // Anyone selected who is no longer on the grid is dropped, or a save could silently
        // include somebody the admin cannot see.
        const visible = new Set(this.assignRows.map((row: any) => String(row.personId)));
        this.selectedPersonIds.forEach((id: string) => {
          if (!visible.has(id)) this.selectedPersonIds.delete(id);
        });
        this.gridLoading = false;
      },
      (err: any) => {
        this.assignTemplates = [];
        this.assignRows = [];
        this.gridLoading = false;
        this.toastr.error('', err.error || 'Could not load the assignment list.');
      }
    );
  }

  isRowSelected(personId: string): boolean {
    return this.selectedPersonIds.has(String(personId));
  }

  toggleRow(personId: string): void {
    const id = String(personId);
    if (this.selectedPersonIds.has(id)) this.selectedPersonIds.delete(id);
    else this.selectedPersonIds.add(id);
  }

  get allSelected(): boolean {
    return this.assignRows.length > 0 && this.selectedPersonIds.size === this.assignRows.length;
  }

  toggleAll(): void {
    if (this.allSelected) this.selectedPersonIds.clear();
    else this.assignRows.forEach((row: any) => this.selectedPersonIds.add(String(row.personId)));
  }

  get selectedCount(): number {
    return this.selectedPersonIds.size;
  }

  assignSelected(): void {
    if (!this.assignTemplateId || this.selectedCount === 0 || this.isClick) return;
    this.isClick = true;
    this.sendAssign(this.assignTemplateId, [...this.selectedPersonIds], false);
  }

  // ---- Edit one row, behind a confirmation --------------------------------

  editAssignmentModel(row: any): void {
    this.showEditModal = true;
    this.editRow = row;
    this.editTemplateId = row.templateId ? String(row.templateId) : '';
    // Deliberately false every time. A confirmation that remembers being ticked is not a
    // confirmation.
    this.confirmChecked = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
  }

  saveEditedAssignment(): void {
    if (!this.confirmChecked || !this.editTemplateId || !this.editRow || this.isClick) return;
    this.isClick = true;
    this.sendAssign(this.editTemplateId, [String(this.editRow.personId)], true);
  }

  // One code path for the bulk panel and the single-row edit — there is no second flow to
  // keep in step. The backend replaces rather than skips, so both mean the same thing.
  private sendAssign(templateId: string, personIds: string[], fromEdit: boolean): void {
    const isStudent = this.assignPersonType === 'student';
    const request = isStudent
      ? this.holidayAssignmentService.bulkAssignClassHoliday({
        adminId: this.adminId,
        templateId: templateId,
        classes: personIds,
      })
      : this.holidayAssignmentService.bulkAssignHoliday({
        adminId: this.adminId,
        templateId: templateId,
        persons: personIds.map((personId: string) => ({
          personType: this.assignPersonType,
          personId: personId,
        })),
      });

    request.subscribe(
      (res: any) => {
        this.isClick = false;
        if (fromEdit) {
          this.showEditModal = false;
          this.editRow = null;
          this.confirmChecked = false;
        } else {
          this.selectedPersonIds.clear();
          this.assignTemplateId = '';
        }
        // Straight back to the grid, so the new template name is on screen before the toast
        // fades. Nothing is cached anywhere — the reconcile lookup reads these rows live, so
        // the attendance register picks the change up on its next run too.
        this.getAssignGrid();
        const assigned = res ? res.assignedCount : 0;
        const updated = res ? res.updatedCount : 0;
        const noun = isStudent ? 'class(es)' : 'people';
        setTimeout(() => {
          this.toastr.success('', `Holiday template set for ${assigned} new ${noun}. ${updated} changed.`);
        }, 500)
      },
      (err: any) => {
        this.isClick = false;
        this.errorCheck = true;
        this.errorMsg = err.error;
        if (!fromEdit) this.toastr.error('', err.error || 'Could not set the holiday template.');
      }
    );
  }

  unassignRow(row: any): void {
    if (!row.assignmentId || this.isClick) return;
    this.isClick = true;
    const request = this.assignPersonType === 'student'
      ? this.holidayAssignmentService.deleteClassHolidayAssignment(row.assignmentId)
      : this.holidayAssignmentService.deleteHolidayAssignment(row.assignmentId);

    request.subscribe(
      (res: any) => {
        this.isClick = false;
        this.showEditModal = false;
        this.editRow = null;
        this.confirmChecked = false;
        this.getAssignGrid();
        setTimeout(() => { this.toastr.success('', res); }, 500)
      },
      (err: any) => {
        this.isClick = false;
        this.errorCheck = true;
        this.errorMsg = err.error;
      }
    );
  }

  // =========================================================================
  // SHARED
  // =========================================================================

  closeModal(): void {
    this.showModal = false;
    this.showTemplateModal = false;
    this.showGenerateModal = false;
    this.showEditModal = false;
    this.updateMode = false;
    this.deleteMode = false;
    this.templateUpdateMode = false;
    this.templateDeleteMode = false;
    this.editRow = null;
    this.confirmChecked = false;
    this.errorCheck = false;
    this.errorMsg = '';
  }

  successDone(res: any): void {
    this.closeModal();
    this.successMsg = '';
    this.getHoliday({ page: 1 });
    setTimeout(() => {
      this.toastr.success('', res);
    }, 500)
  }

  templateSuccessDone(res: any): void {
    this.closeModal();
    this.successMsg = '';
    this.getHolidayTemplate({ page: 1 });
    setTimeout(() => {
      this.toastr.success('', res);
    }, 500)
  }

  // The datepicker hands back a LOCAL-midnight Date. Reading its LOCAL parts — never
  // toISOString(), which shifts a day for anyone east of UTC — is the same conversion
  // roster.component.ts and leave-request.component.ts use, and the backend expects exactly
  // this "YYYY-MM-DD" shape.
  private toDateKey(value: any): string {
    if (!value) return '';
    const date = new Date(value);
    const mm = `${date.getMonth() + 1}`.padStart(2, '0');
    const dd = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${mm}-${dd}`;
  }

  // The inverse, for seeding the edit form. Built from the parts rather than
  // `new Date("2026-10-26")`, which the browser parses as UTC and would render as the 25th
  // anywhere west of Greenwich.
  private fromDateKey(dateKey: any): Date | null {
    if (!dateKey) return null;
    const parts = String(dateKey).slice(0, 10).split('-');
    if (parts.length !== 3) return null;
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }
}
