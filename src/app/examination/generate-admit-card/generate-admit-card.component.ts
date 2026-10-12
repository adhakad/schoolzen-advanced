/**
 * Examination › Generate Admit Card — every student of the session, one row per generated
 * admit card; preview and print. No configuration lives here: every card comes from Admit
 * Card Structure's generation job, and renders its own generation-time snapshot.
 *
 * Reference: docs/schoolzen-planning/v1/examination/generate-admit-card.html (+ .md, errors.md)
 *
 * Toolbar: row1 search + "Print Selected (N)" (disabled until rows are checked), row2
 * Class → Stream → Group → Section. Print Selected asks One/Two per page through the shared
 * print-mode choice, then prints the combined preview with window.print(). Needs the
 * 'admit-card' view grant (enforced by the API).
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { GenerateAdmitCardService } from 'src/app/shared/services/examination/generate-admit-card.service';
import {
  AdmitCardDocument, AdmitCardRow, LetterheadHeader, PrintMode, SkippedNotice
} from 'src/app/shared/models/examination/examination.model';
import { CascadeFilterValue, EMPTY_CASCADE, StudentFilterOptions } from 'src/app/shared/models/student/student.model';
import { errorMessageOf } from 'src/app/shared/utils/api-error.util';
import { avatarGradient } from 'src/app/shared/utils/avatar.util';

const EMPTY_SUMMARY = { withCard: 0, missing: 0 };

@Component({
  selector: 'app-generate-admit-card',
  templateUrl: './generate-admit-card.component.html',
  styleUrls: ['../examination-page.css', './generate-admit-card.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GenerateAdmitCardComponent implements OnInit, OnDestroy {
  adminId = '';
  session = '';
  options: StudentFilterOptions | null = null;
  optionsError = '';
  filter: CascadeFilterValue = { ...EMPTY_CASCADE };
  search = '';

  rows: AdmitCardRow[] = [];
  total = 0;
  page = 1;
  limit = 25;
  private cursors: string[] = [''];
  summary = EMPTY_SUMMARY;
  loading = true;
  loadError = '';
  /** cardId → row */
  selected = new Map<string, AdmitCardRow>();

  printModeOpen = false;
  previewOpen = false;
  previewTitle = '';
  previewLoading = false;
  previewError = '';
  printHeader: LetterheadHeader | null = null;
  documents: AdmitCardDocument[] = [];
  printMode: PrintMode = 1;
  skipped: SkippedNotice | null = null;

  private search$ = new Subject<string>();
  private destroyed$ = new Subject<void>();

  constructor(
    private api: GenerateAdmitCardService,
    private optionsService: StudentOptionsService,
    private shellContext: ShellContextService,
    private adminAuthService: AdminAuthService,
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
      this.fetch();
    });
    this.shellContext.context.pipe(map((context) => context.activeSession), distinctUntilChanged(), takeUntil(this.destroyed$))
      .subscribe((session) => {
        this.session = session;
        if (session) this.fetch();
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
      this.optionsError = errorMessageOf(error, "Couldn't load classes.");
      this.cdr.markForCheck();
    });
  }

  onSearchChange(value: string): void {
    this.search$.next(value.trim());
  }

  onFilterChange(value: CascadeFilterValue): void {
    this.filter = value;
    this.fetch();
  }

  onLimitChange(limit: number): void {
    this.limit = limit;
    this.fetch();
  }

  onPageChange(page: number): void {
    if (page < 1 || page > this.cursors.length) return;
    this.loadPage(page);
  }

  fetch(): void {
    if (!this.session) return;
    this.cursors = [''];
    this.selected.clear();
    this.loadPage(1);
  }

  private loadPage(page: number): void {
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.api.list(this.adminId, this.session, { ...this.filter, search: this.search }, this.cursors[page - 1], this.limit)
      .pipe(takeUntil(this.destroyed$)).subscribe((res) => {
        this.rows = res.rows || [];
        this.page = page;
        this.cursors = this.cursors.slice(0, page);
        if (res.nextCursor) this.cursors.push(res.nextCursor);
        if (res.total != null) this.total = res.total;
        if (res.summary) this.summary = res.summary;
        this.loading = false;
        this.cdr.markForCheck();
      }, (error) => {
        this.rows = [];
        this.loading = false;
        this.loadError = errorMessageOf(error, "Couldn't load students.");
        this.cdr.markForCheck();
      });
  }

  // ---- Selection ----------------------------------------------------------------------------

  get selectableRows(): AdmitCardRow[] {
    return this.rows.filter((row) => !!row.cardId);
  }

  get allSelected(): boolean {
    return this.selectableRows.length > 0 && this.selectableRows.every((row) => this.selected.has(row.cardId as string));
  }

  toggleAll(checked: boolean): void {
    this.selectableRows.forEach((row) => {
      if (checked) this.selected.set(row.cardId as string, row);
      else this.selected.delete(row.cardId as string);
    });
  }

  toggleRow(row: AdmitCardRow, checked: boolean): void {
    if (!row.cardId) return;
    if (checked) this.selected.set(row.cardId, row);
    else this.selected.delete(row.cardId);
  }

  get selectedCount(): number {
    return this.selected.size;
  }

  // ---- Preview / print ----------------------------------------------------------------------

  openPreview(row: AdmitCardRow): void {
    if (!row.cardId) return;
    this.printMode = 1;
    this.previewTitle = `Admit Card Preview — ${row.name}`;
    this.loadDocuments([row.cardId]);
  }

  openPrintMode(): void {
    if (this.selectedCount) this.printModeOpen = true;
  }

  onPrintMode(mode: PrintMode): void {
    this.printModeOpen = false;
    this.printMode = mode;
    this.previewTitle = `Admit Cards — ${mode} per page (${this.selectedCount})`;
    this.loadDocuments([...this.selected.keys()]);
  }

  private loadDocuments(cardIds: string[]): void {
    this.previewOpen = true;
    this.previewLoading = true;
    this.previewError = '';
    this.documents = [];
    this.skipped = null;
    this.cdr.markForCheck();
    this.api.print(this.adminId, this.session, cardIds).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.printHeader = res.header;
      this.documents = res.documents;
      this.skipped = res.skipped;
      this.previewLoading = false;
      this.cdr.markForCheck();
    }, (error) => {
      this.previewLoading = false;
      this.previewError = errorMessageOf(error, "Couldn't load the admit card.");
      this.cdr.markForCheck();
    });
  }

  closePreview(): void {
    this.previewOpen = false;
    this.documents = [];
  }

  print(): void {
    window.print();
  }

  avatar(row: AdmitCardRow): string {
    return avatarGradient(row.studentId);
  }

  roll(value: number | null): string {
    return value == null ? '—' : (value < 10 ? '0' + value : String(value));
  }

  trackByRow = (_index: number, row: AdmitCardRow): string => row.rowId;
  trackByCard = (_index: number, doc: AdmitCardDocument): string => doc.cardId;
}
