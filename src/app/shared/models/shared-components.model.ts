/**
 * Typed @Input() contracts for the shared component library. Every component takes a
 * typed shape from this file rather than `any`, so a module wiring in the wrong data
 * fails at compile time instead of rendering blank at runtime.
 */

/* --- app-summary-strip --- */
export interface SummaryCount {
  label: string;
  value: string | number;
  /** One count per strip may be the accent-purple "hero" number. */
  hero?: boolean;
}

/* --- app-data-toolbar --- */
export interface ToolbarFilterOption {
  value: string;
  label: string;
}

/**
 * What the pill renders. 'select' is the default; 'date' and 'month' render a Material
 * datepicker instead of a dropdown but keep the same {key, value} change contract, so a
 * page never handles a Date object — 'date' emits 'YYYY-MM-DD', 'month' emits 'YYYY-MM'.
 */
export type ToolbarFilterType = 'select' | 'date' | 'month';

export interface ToolbarFilter {
  /** Stable key emitted with every filterChange. */
  key: string;
  /** Tabler icon name without the `ti-` prefix, e.g. 'users'. Optional. */
  icon?: string;
  /** Defaults to 'select'. */
  type?: ToolbarFilterType;
  /** Ignored for the date types. */
  options?: readonly ToolbarFilterOption[];
  value: string;
  /**
   * Mutual-dependency filter (Department -> Designation, Class -> Section): rendered
   * always, greyed out until its parent has a value. NEVER hidden — a pill that
   * disappears breaks the toolbar's shape (a real bug caught once already).
   */
  disabled?: boolean;
  /**
   * Existence-based filter (Section, Stream only): the school has never created any,
   * so the control can never do anything useful and is left out of the DOM entirely.
   * This is the ONLY case where a pill may be absent.
   */
  existenceBased?: boolean;
  hidden?: boolean;
}

export interface ToolbarAction {
  label: string;
  /** Tabler icon name without the `ti-` prefix. */
  icon?: string;
  disabled?: boolean;
}

export interface ToolbarFilterChange {
  key: string;
  value: string;
}

/* --- app-status-chip --- */
export type StatusVariant =
  | 'draft' | 'locked' | 'pending'
  | 'present' | 'late' | 'absent' | 'halfday' | 'leave' | 'holiday'
  | 'approved' | 'rejected'
  | 'active' | 'inactive'
  | 'neutral';

/* --- app-icon-action --- */
export type IconActionVariant = 'neutral' | 'primary' | 'warning';

/* --- app-confirm-modal --- */
export interface ConfirmConfig {
  title: string;
  /** One calm sentence of consequence. No stacked warnings, no all-caps. */
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'neutral' | 'warning';
  /**
   * When set, the confirm button stays disabled until this exact word is typed —
   * required for bulk deletes and for deleting a record other records depend on.
   */
  typeToConfirm?: string;
  /** Optional plain-language scope line, e.g. "12 roster entries across 3 people". */
  scopeNote?: string;
}

/* --- app-count-pill --- */
/**
 * Which colour the pill wears. Two only, because the pill exists to distinguish two
 * columns that sit next to each other (amber Streams, purple Sections) — it is not a
 * general-purpose badge, and adding a third variant means someone is using it as one.
 */
export type CountPillVariant = 'stream' | 'section';

/* --- app-data-table --- */
export interface DataTableColumn {
  /** Matches the key used in the row cell template. */
  key: string;
  label: string;
  /** CSS width, e.g. '180px'. Column widths are fixed, per the design system. */
  width: string;
  align?: 'left' | 'right';
}

/* --- app-dd --- */
/**
 * One row of a `.dd` menu. `value` is the stable identity emitted on selection; '' is a
 * real value (the "All classes" / "— Select —" row), never a synonym for "no option".
 */
export interface DdOption {
  value: string;
  label: string;
  /** Bootstrap Icon name without the `bi-` prefix, e.g. 'person'. */
  icon?: string;
  /** Renders in the danger colour — Logout, and nothing else so far. */
  danger?: boolean;
}

/* --- app-pagination-bar --- */
export interface PageState {
  /** 1-based. */
  page: number;
  limit: number;
  total: number;
}
