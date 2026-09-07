/**
 * The shared component library rendered in every documented state, assembled exactly the
 * way a real module page will assemble it. Its top section reproduces
 * docs/schoolzen-planning/v1/payroll/generate-payroll.html — the canonical reference —
 * with the same columns, the same three row states and the same sample data, so the two
 * can be diffed side by side in a browser. Everything below that is the rest of the
 * library's states (chip variants, icon-action variants, the two confirm-modal patterns).
 *
 * This page exists to verify the library; it is not a product page.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  ConfirmConfig, DataTableColumn, StatusVariant, SummaryCount,
  ToolbarAction, ToolbarFilter, ToolbarFilterChange
} from 'src/app/shared/models/shared-components.model';

interface PayrollRow {
  id: string;
  name: string;
  role: string;
  present: number;
  late: number;
  absent: number;
  gross: string;
  deductions: string;
  net: string;
  status: string;
  variant: StatusVariant;
  pending?: boolean;
}

interface StaffRow {
  id: string;
  name: string;
  role: string;
  department: string;
  status: string;
  variant: StatusVariant;
}

interface GalleryPerson {
  id: string;
  name: string;
  role: string;
}

@Component({
  selector: 'app-components-gallery',
  templateUrl: './components-gallery.component.html',
  styleUrls: ['./components-gallery.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ComponentsGalleryComponent {
  readonly counts: readonly SummaryCount[] = [
    { label: 'payroll this month', value: '₹58.6L', hero: true },
    { label: 'locked', value: 28 },
    { label: 'pending drafts', value: 14 },
    { label: 'total staff', value: 42 }
  ];

  // Fixed order: search -> scope filters -> status/mode -> period picker LAST, with the
  // dependent pair (Department, Designation) adjacent.
  filters: ToolbarFilter[] = [
    {
      key: 'personType', icon: 'users', value: 'all',
      options: [
        { value: 'all', label: 'All staff' },
        { value: 'teacher', label: 'Teachers' },
        { value: 'staff', label: 'Support staff' }
      ]
    },
    {
      key: 'department', icon: 'building', value: '',
      options: [
        { value: '', label: 'All depts' },
        { value: 'teaching', label: 'Teaching' },
        { value: 'admin', label: 'Admin' }
      ]
    },
    {
      // Mutual-dependency: always visible, enabled only once a department is chosen.
      key: 'designation', icon: 'id-badge', value: '', disabled: true,
      options: [{ value: '', label: 'All designations' }]
    },
    {
      key: 'status', icon: 'circle-check', value: '',
      options: [
        { value: '', label: 'All status' },
        { value: 'draft', label: 'Draft' },
        { value: 'locked', label: 'Locked' }
      ]
    },
    {
      // The period picker is always last, and a period is a real month picker (Material
      // datepicker on the year grid) rather than a hand-maintained list of months.
      key: 'period', icon: 'calendar', type: 'month', value: '2026-08'
    }
  ];

  readonly primaryAction: ToolbarAction = {
    label: 'Generate for selected', icon: 'player-play', disabled: true
  };

  readonly columns: readonly DataTableColumn[] = [
    { key: 'employee', label: 'Employee', width: '180px' },
    { key: 'attendance', label: 'Attendance', width: '110px' },
    { key: 'gross', label: 'Gross', width: '90px' },
    { key: 'deductions', label: 'Deductions', width: '90px' },
    { key: 'net', label: 'Net salary', width: '100px' },
    { key: 'status', label: 'Status', width: '100px' },
    { key: 'action', label: 'Action', width: '100px', align: 'right' }
  ];

  readonly rows: readonly PayrollRow[] = [
    {
      id: '1', name: 'Priya Sharma', role: 'Primary Teacher',
      present: 22, late: 2, absent: 0,
      gross: '₹26,000', deductions: '−₹3,000', net: '₹23,000',
      status: 'Locked', variant: 'locked'
    },
    {
      id: '2', name: 'Rahul Verma', role: 'Accountant',
      present: 20, late: 1, absent: 3,
      gross: '—', deductions: '—', net: 'Not generated',
      status: 'Pending', variant: 'pending', pending: true
    },
    {
      id: '3', name: 'Amit Joshi', role: 'Peon',
      present: 26, late: 0, absent: 0,
      gross: '₹15,000', deductions: '−₹1,200', net: '₹13,800',
      status: 'Draft', variant: 'draft'
    }
  ];

  selected: readonly PayrollRow[] = [];

  // --- extra states, one per component section -------------------------------------
  readonly attendanceCounts: readonly SummaryCount[] = [
    { label: 'present', value: 38 },
    { label: 'late', value: 3 },
    { label: 'absent', value: 1 }
  ];

  readonly singleCount: readonly SummaryCount[] = [{ label: 'unsent reminders', value: 7, hero: true }];

  readonly simpleFilters: readonly ToolbarFilter[] = [
    {
      key: 'status', icon: 'circle-check', value: '',
      options: [
        { value: '', label: 'All status' },
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' }
      ]
    },
    // A single-day filter: same pill, same {key, value} contract, emits 'YYYY-MM-DD'.
    { key: 'asOf', icon: 'calendar-event', type: 'date', value: '2026-08-09' }
  ];

  readonly staffColumns: readonly DataTableColumn[] = [
    { key: 'name', label: 'Staff member', width: '200px' },
    { key: 'department', label: 'Department', width: '160px' },
    { key: 'status', label: 'Status', width: '120px' },
    { key: 'action', label: 'Action', width: '100px', align: 'right' }
  ];

  readonly staffRows: readonly StaffRow[] = [
    { id: 's1', name: 'Meera Iyer', role: 'Head of Science', department: 'Teaching', status: 'Active', variant: 'active' },
    { id: 's2', name: 'Sanjay Patil', role: 'Accountant', department: 'Administration', status: 'Active', variant: 'active' },
    { id: 's3', name: 'Farida Khan', role: 'Librarian', department: 'Support', status: 'Inactive', variant: 'inactive' }
  ];

  /** Same columns, no data — the empty state a filtered list falls into. */
  readonly noRows: readonly StaffRow[] = [];

  readonly avatarPeople: readonly GalleryPerson[] = [
    { id: '1', name: 'Priya Sharma', role: 'Primary Teacher' },
    { id: '2', name: 'Rahul Verma', role: 'Accountant' },
    { id: '3', name: 'Amit Joshi', role: 'Peon' }
  ];

  readonly deleteStaffConfirm: ConfirmConfig = {
    title: 'Remove this staff member?',
    message: 'Their record is removed from the staff list. Attendance and payroll already recorded against them stays where it is.',
    confirmLabel: 'Remove',
    variant: 'warning'
  };

  readonly unlockConfirm: ConfirmConfig = {
    title: 'Unlock this payroll?',
    message: 'Unlocking reopens August 2026 so it can be regenerated. Any payment already recorded against it stays as it is.',
    confirmLabel: 'Unlock',
    variant: 'warning'
  };

  readonly clearRosterConfirm: ConfirmConfig = {
    title: 'Clear shift assignments?',
    message: 'This removes the assigned shifts for the selected people across the chosen dates. Attendance already recorded is not affected, but nothing decides their expected shift until they are reassigned.',
    scopeNote: '12 roster entries across 3 people, 1-15 August 2026.',
    confirmLabel: 'Delete',
    variant: 'warning',
    typeToConfirm: 'DELETE'
  };

  readonly allVariants: readonly { label: string; variant: StatusVariant }[] = [
    { label: 'Draft', variant: 'draft' },
    { label: 'Locked', variant: 'locked' },
    { label: 'Pending', variant: 'pending' },
    { label: 'Present', variant: 'present' },
    { label: 'Late', variant: 'late' },
    { label: 'Half day', variant: 'halfday' },
    { label: 'Absent', variant: 'absent' },
    { label: 'Leave', variant: 'leave' },
    { label: 'Holiday', variant: 'holiday' },
    { label: 'Approved', variant: 'approved' },
    { label: 'Rejected', variant: 'rejected' },
    { label: 'Active', variant: 'active' },
    { label: 'Inactive', variant: 'inactive' }
  ];

  lastEvent = 'Nothing yet.';
  standaloneConfirmOpen = false;
  plainConfirmOpen = false;

  onSearch(value: string): void {
    this.lastEvent = 'searchChange: "' + value + '"';
  }

  onFilterChange(change: ToolbarFilterChange): void {
    this.lastEvent = 'filterChange: ' + change.key + ' = "' + change.value + '"';
    this.filters = this.filters.map((filter) => {
      if (filter.key === change.key) return { ...filter, value: change.value };
      // Designation narrows within a department: disabled until one is chosen. It is
      // toggled with `disabled`, never hidden.
      if (change.key === 'department' && filter.key === 'designation') {
        return { ...filter, disabled: !change.value };
      }
      return filter;
    });
  }

  onSelectionChange(rows: readonly PayrollRow[]): void {
    this.selected = rows;
    this.lastEvent = 'selectionChange: ' + rows.length + ' row(s)';
  }

  onAction(label: string, row: { name: string }): void {
    this.lastEvent = label + ' -> ' + row.name;
  }

  get footerLeft(): string {
    return 'Showing ' + this.rows.length + ' of 42 staff';
  }

  trackByVariant = (_index: number, item: { variant: StatusVariant }): string => item.variant;

  trackByPersonId = (_index: number, person: GalleryPerson): string => person.id;
}
