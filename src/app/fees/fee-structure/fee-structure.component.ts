/**
 * Fee Structure — a Class(+Stream+Group)'s annual fee for the session: admission fee plus a
 * checklist of named particulars.
 *
 * Reference: docs/schoolzen-planning/v1/fees/fee-structure.html
 *
 * Toolbar: search + Create (row 1), Class → Stream → Group cascade (row 2). Breakdown opens the
 * full particulars list. Create/Edit/Delete need the 'fees-structure' grant (`canEdit`); an
 * edit changes only the money — Session/Class/Stream/Group are the structure's identity. A
 * delete needs DELETE typed and is refused by the server once money has touched any student
 * record built from it.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { FeeStructureService } from 'src/app/shared/services/fees/fee-structure.service';
import { FeeStructurePayload, FeeStructureRow } from 'src/app/shared/models/fees/fees.model';
import {
  CascadeFilterValue, EMPTY_CASCADE, FilterClass, StudentFilterOptions
} from 'src/app/shared/models/student/student.model';
import { DdOption } from 'src/app/shared/models/shared-components.model';
import { errorMessageOf, validationErrorsOf } from 'src/app/shared/utils/api-error.util';
import { rupees, shortSession } from '../fees-format';

interface ParticularDraft {
  name: string;
  amount: string;
}

interface StructureForm {
  classId: string;
  streamId: string;
  groupId: string;
  admissionFee: string;
  particulars: ParticularDraft[];
}

const emptyForm = (): StructureForm => ({ classId: '', streamId: '', groupId: '', admissionFee: '', particulars: [{ name: '', amount: '' }] });
const titleCase = (text: string): string => (text || '').replace(/\b\w/g, (c) => c.toUpperCase());

/** Non-negative number; blank allowed only where the field is optional. */
const validAmount = (value: string, allowBlank = false): boolean => {
  if (String(value ?? '').trim() === '') return allowBlank;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
};

@Component({
  selector: 'app-fee-structure',
  templateUrl: './fee-structure.component.html',
  styleUrls: ['./fee-structure.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeeStructureComponent implements OnInit, OnDestroy {
  adminId = '';
  session = '';
  options: StudentFilterOptions | null = null;
  optionsError = '';
  filter: CascadeFilterValue = { ...EMPTY_CASCADE };
  search = '';

  rows: FeeStructureRow[] = [];
  total = 0;
  page = 1;
  limit = 25;
  summary = { structures: 0, classesCovered: 0 };
  canEdit = false;
  loading = true;
  loadError = '';

  // Create / Edit
  modalOpen = false;
  editingId = '';
  form: StructureForm = emptyForm();
  fieldErrors: Record<string, string> = {};
  formError = '';
  isClick = false;

  // Breakdown
  breakdown: FeeStructureRow | null = null;

  // Delete
  deleteTarget: FeeStructureRow | null = null;
  deleteInput = '';
  deleteError = '';
  isDeleteClick = false;

  private search$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: FeeStructureService,
    private optionsService: StudentOptionsService,
    private shellContext: ShellContextService,
    private adminAuthService: AdminAuthService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.adminId = this.adminAuthService.getLoggedInAdminInfo()?.id || '';
    if (!this.adminId) {
      this.loading = false;
      return;
    }
    this.loadOptions();
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroyed$)).subscribe((term) => {
      this.search = term;
      this.page = 1;
      this.fetch();
    });
    this.shellContext.context.pipe(map((context) => context.activeSession), distinctUntilChanged(), takeUntil(this.destroyed$))
      .subscribe((session) => {
        this.session = session;
        if (!session) return;
        this.page = 1;
        this.fetch();
      });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  loadOptions(): void {
    this.optionsError = '';
    this.optionsService.getFilterOptions(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((options) => {
      this.options = options;
      this.cdr.markForCheck();
    }, (error) => {
      // A failed options fetch is said out loud, never an empty dropdown.
      this.optionsError = errorMessageOf(error, "Couldn't load classes.");
      this.cdr.markForCheck();
    });
  }

  onSearchChange(value: string): void {
    this.search$.next(value.trim());
  }

  onFilterChange(value: CascadeFilterValue): void {
    this.filter = value;
    this.page = 1;
    this.fetch();
  }

  onPageChange(page: number): void {
    this.page = page;
    this.fetch();
  }

  onLimitChange(limit: number): void {
    this.limit = limit;
    this.page = 1;
    this.fetch();
  }

  fetch(): void {
    if (!this.session) return;
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.api.list(this.adminId, this.session, {
      classId: this.filter.classId, streamId: this.filter.streamId, groupId: this.filter.groupId,
      search: this.search, page: this.page, limit: this.limit
    }).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.rows = res.rows || [];
      this.total = res.total || 0;
      this.summary = res.summary || { structures: 0, classesCovered: 0 };
      this.canEdit = Boolean(res.canEdit);
      this.loading = false;
      this.cdr.markForCheck();
    }, (error) => {
      this.rows = [];
      this.total = 0;
      this.loading = false;
      this.loadError = errorMessageOf(error, "Couldn't load fee structures.");
      this.cdr.markForCheck();
    });
  }

  money(value: number): string {
    return rupees(value);
  }

  get sessionShort(): string {
    return shortSession(this.session);
  }

  // --- modal cascade ---------------------------------------------------------------------

  private get chosenClass(): FilterClass | null {
    return this.options?.classes.find((item) => item._id === this.form.classId) || null;
  }

  get classOptions(): DdOption[] {
    return [{ value: '', label: '— Select —' }].concat((this.options?.classes || []).map((item) => ({ value: item._id, label: item.label })));
  }

  get streamDisabled(): boolean {
    return Boolean(this.editingId) || !this.chosenClass || !this.chosenClass.hasStreams;
  }

  get streamOptions(): DdOption[] {
    return [{ value: '', label: '— Select —' }].concat((this.chosenClass?.streams || []).map((item) => ({ value: item._id, label: titleCase(item.name) })));
  }

  private get groupChoices(): DdOption[] {
    const chosen = this.chosenClass;
    if (!chosen || (chosen.hasStreams && !this.form.streamId)) return [];
    return (this.options?.groups || [])
      .filter((group) => !group.isSystemGroup && group.classId === chosen._id && (group.streamId || '') === (this.form.streamId || ''))
      .map((group) => ({ value: group._id, label: group.name }));
  }

  get groupDisabled(): boolean {
    return Boolean(this.editingId) || !this.groupChoices.length;
  }

  get groupOptions(): DdOption[] {
    return [{ value: '', label: '— Select —' }].concat(this.groupChoices);
  }

  get streamPlaceholder(): string {
    return this.chosenClass ? '— Select —' : 'Select a class first';
  }

  get groupPlaceholder(): string {
    return this.chosenClass?.hasStreams && !this.form.streamId ? 'Select a stream first' : '— Select —';
  }

  onFormClass(classId: string): void {
    this.form = { ...this.form, classId, streamId: '', groupId: '' };
  }

  onFormStream(streamId: string): void {
    this.form = { ...this.form, streamId, groupId: '' };
  }

  // --- Create / Edit ---------------------------------------------------------------------

  openCreate(): void {
    this.editingId = '';
    this.form = emptyForm();
    this.form.classId = this.filter.classId;
    this.form.streamId = this.filter.streamId;
    this.form.groupId = this.filter.groupId;
    this.resetFormErrors();
    this.modalOpen = true;
  }

  openEdit(row: FeeStructureRow): void {
    this.editingId = row._id;
    this.form = {
      classId: row.classId,
      streamId: row.streamId,
      groupId: row.groupId,
      admissionFee: String(row.admissionFee ?? ''),
      particulars: row.particulars.map((item) => ({ name: item.name, amount: String(item.amount) }))
    };
    this.resetFormErrors();
    this.modalOpen = true;
  }

  closeModal(): void {
    if (this.isClick) return;
    this.modalOpen = false;
  }

  addParticular(): void {
    this.form.particulars = [...this.form.particulars, { name: '', amount: '' }];
  }

  removeParticular(index: number): void {
    this.form.particulars = this.form.particulars.filter((_item, i) => i !== index);
  }

  get particularTotal(): number {
    return this.form.particulars.reduce((sum, item) => sum + (validAmount(item.amount) ? Number(item.amount) : 0), 0);
  }

  get particularError(): string {
    if (this.fieldErrors['particulars']) return this.fieldErrors['particulars'];
    const names = this.form.particulars.map((item) => item.name.trim().toLowerCase()).filter(Boolean);
    return new Set(names).size !== names.length ? 'Each particular can be listed only once.' : '';
  }

  private resetFormErrors(): void {
    this.fieldErrors = {};
    this.formError = '';
  }

  /** Client-side mirror of the server's checks (FEE_PARTICULAR_INVALID). */
  private validate(): boolean {
    const errors: Record<string, string> = {};
    if (!this.form.classId) errors['classId'] = 'Choose a class.';
    if (this.chosenClass?.hasStreams && !this.form.streamId) errors['streamId'] = 'Choose a stream for this class.';
    if (!validAmount(this.form.admissionFee, true)) errors['admissionFee'] = 'Enter a valid amount.';
    if (!this.form.particulars.length) errors['particulars'] = 'Add at least one fee particular.';
    this.form.particulars.forEach((item, i) => {
      if (!item.name.trim() || !validAmount(item.amount)) {
        errors[`particulars.${i}`] = 'invalid';
        errors['particulars'] = 'Enter a name and a valid amount for every fee particular.';
      }
    });
    this.fieldErrors = errors;
    return !Object.keys(errors).length && !this.particularError;
  }

  isParticularInvalid(index: number): boolean {
    return Boolean(this.fieldErrors[`particulars.${index}`] || this.fieldErrors[`particulars.${index}.name`] || this.fieldErrors[`particulars.${index}.amount`]);
  }

  submit(): void {
    if (this.isClick) return;
    this.formError = '';
    if (!this.validate()) {
      this.cdr.markForCheck();
      return;
    }
    const payload: FeeStructurePayload = {
      adminId: this.adminId,
      session: this.session,
      classId: this.form.classId,
      streamId: this.form.streamId,
      groupId: this.form.groupId,
      admissionFee: String(this.form.admissionFee).trim() === '' ? 0 : Number(this.form.admissionFee),
      particulars: this.form.particulars.map((item) => ({ name: item.name.trim(), amount: Number(item.amount) }))
    };
    this.isClick = true;
    const request = this.editingId ? this.api.update(this.editingId, payload) : this.api.create(payload);
    request.pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.isClick = false;
      this.modalOpen = false;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.fetch();
    }, (error) => {
      this.isClick = false;
      const validation = validationErrorsOf(error);
      if (validation && Object.keys(validation.fields).length) {
        this.fieldErrors = validation.fields;
        if (Object.keys(validation.fields).some((key) => key.startsWith('particulars.'))) {
          this.fieldErrors['particulars'] = 'Enter a name and a valid amount for every fee particular.';
        }
      } else {
        this.formError = errorMessageOf(error, "Couldn't save the fee structure.");
      }
      this.cdr.markForCheck();
    });
  }

  // --- Breakdown ---------------------------------------------------------------------------

  openBreakdown(row: FeeStructureRow): void {
    this.breakdown = row;
  }

  closeBreakdown(): void {
    this.breakdown = null;
  }

  // --- Delete ------------------------------------------------------------------------------

  openDelete(row: FeeStructureRow): void {
    this.deleteTarget = row;
    this.deleteInput = '';
    this.deleteError = '';
  }

  closeDelete(): void {
    if (this.isDeleteClick) return;
    this.deleteTarget = null;
  }

  get deleteEnabled(): boolean {
    return this.deleteInput === 'DELETE' && !this.isDeleteClick;
  }

  confirmDelete(): void {
    if (!this.deleteEnabled || !this.deleteTarget) return;
    this.isDeleteClick = true;
    this.deleteError = '';
    this.api.remove(this.adminId, this.deleteTarget._id, this.deleteInput).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.isDeleteClick = false;
      this.deleteTarget = null;
      this.snackBar.open(res.message, 'Close', { duration: 3000 });
      this.fetch();
    }, (error) => {
      this.isDeleteClick = false;
      // FEE_STRUCTURE_IN_USE arrives with its count — shown as-is.
      this.deleteError = errorMessageOf(error, "Couldn't delete the fee structure.");
      this.cdr.markForCheck();
    });
  }

  trackById = (_index: number, row: { _id: string }): string => row._id;
  trackByIndex = (index: number): number => index;
}
