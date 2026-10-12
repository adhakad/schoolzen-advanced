/**
 * The Department → Designation pair every Payroll toolbar's row 2 starts with (Assign
 * Salary, Generate Payroll, Salary Payouts). Designation stays disabled until a Department
 * is chosen and only lists that department's designations — the same cached lookup lists
 * Manage Staff reads.
 *
 * Renders as two `app-dd` siblings so they sit directly in the parent's toolbar grid.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output
} from '@angular/core';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DepartmentsService } from 'src/app/shared/services/staff/departments.service';
import { DesignationsService } from 'src/app/shared/services/staff/designations.service';
import { Department } from 'src/app/shared/models/staff/department.model';
import { Designation } from 'src/app/shared/models/staff/designation.model';
import { DdOption } from 'src/app/shared/models/shared-components.model';

export interface StaffCascadeValue {
  departmentId: string;
  designationId: string;
}

@Component({
  selector: 'app-staff-cascade-filter',
  template: `
    <app-dd class="sw-select-pill" [options]="departmentOptions" [value]="value.departmentId"
            ariaLabel="Filter by department" (valueChange)="onDepartment($event)"></app-dd>
    <app-dd class="sw-select-pill" [options]="designationOptions" [value]="value.designationId"
            [disabled]="!value.departmentId" disabledHint="Select a department first"
            ariaLabel="Filter by designation" (valueChange)="onDesignation($event)"></app-dd>
    <div class="fetch-error cascade-error" *ngIf="error" role="alert">
      <i class="bi bi-exclamation-circle"></i> {{ error }}
      <button type="button" class="link-btn" (click)="load()">Retry</button>
    </div>
  `,
  styles: [':host { display: contents; } .cascade-error { grid-column: 1 / -1; }'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StaffCascadeFilterComponent implements OnInit, OnDestroy {
  @Input() adminId = '';
  @Input() value: StaffCascadeValue = { departmentId: '', designationId: '' };
  @Output() valueChange = new EventEmitter<StaffCascadeValue>();

  departmentOptions: DdOption[] = [{ value: '', label: 'All departments' }];
  designationOptions: DdOption[] = [{ value: '', label: 'All designations' }];
  error = '';

  private departments: Department[] = [];
  private designations: Designation[] = [];
  private destroyed$ = new Subject<void>();

  constructor(
    private departmentsApi: DepartmentsService,
    private designationsApi: DesignationsService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  load(): void {
    if (!this.adminId) return;
    this.error = '';
    forkJoin([this.departmentsApi.getOptions(this.adminId), this.designationsApi.getOptions(this.adminId)])
      .pipe(takeUntil(this.destroyed$))
      .subscribe(([departments, designations]) => {
        this.departments = departments.rows || [];
        this.designations = designations.rows || [];
        this.rebuild();
      }, () => {
        this.departments = [];
        this.designations = [];
        this.error = "Couldn't load departments and designations.";
        this.rebuild();
      });
  }

  onDepartment(departmentId: string): void {
    this.value = { departmentId, designationId: '' };
    this.rebuild();
    this.valueChange.emit(this.value);
  }

  onDesignation(designationId: string): void {
    this.value = { ...this.value, designationId };
    this.valueChange.emit(this.value);
  }

  private rebuild(): void {
    this.departmentOptions = [
      { value: '', label: 'All departments' },
      ...this.departments.map((dept) => ({ value: dept._id, label: dept.name }))
    ];
    this.designationOptions = [
      { value: '', label: 'All designations' },
      ...this.designations
        .filter((item) => this.value.departmentId && item.departmentId === this.value.departmentId)
        .map((item) => ({ value: item._id, label: item.title }))
    ];
    this.cdr.markForCheck();
  }
}
