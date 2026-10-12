/**
 * TC Structure — one school-wide settings form, not a table.
 *
 * Reference: docs/schoolzen-planning/v1/certificates/tc-structure.html
 *
 * The 19 board-mandated fields come from the server's code constant and render locked
 * (disabled checkbox + lock icon). Only "Next TC Serial Number" is editable, and only with the
 * 'tc-structure' grant (`canEdit`, enforced by the API).
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { TcStructureService } from 'src/app/shared/services/certificates/tc-structure.service';
import { TcStructureView } from 'src/app/shared/models/certificates/certificates.model';
import { errorMessageOf, validationErrorsOf } from 'src/app/shared/utils/api-error.util';

@Component({
  selector: 'app-tc-structure',
  templateUrl: './tc-structure.component.html',
  styleUrls: ['./tc-structure.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TcStructureComponent implements OnInit, OnDestroy {
  adminId = '';
  session = '';
  structure: TcStructureView | null = null;
  serial = '';
  loading = true;
  loadError = '';
  serialError = '';
  isClick = false;

  private destroyed$ = new Subject<void>();

  constructor(
    private api: TcStructureService,
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

  fetch(): void {
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.api.get(this.adminId, this.session).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.apply(res);
      this.loading = false;
      this.cdr.markForCheck();
    }, (error) => {
      this.loading = false;
      this.loadError = errorMessageOf(error, "Couldn't load the TC structure.");
      this.cdr.markForCheck();
    });
  }

  save(): void {
    if (this.isClick || !this.structure?.canEdit) return;
    this.isClick = true;
    this.serialError = '';
    this.api.save(this.adminId, this.session, this.serial.trim(), this.structure.nextSerialNumber)
      .pipe(takeUntil(this.destroyed$)).subscribe((res) => {
        this.apply(res);
        this.isClick = false;
        this.snackBar.open(res.message, 'Close', { duration: 3000 });
        this.cdr.markForCheck();
      }, (error) => {
        this.isClick = false;
        const invalid = validationErrorsOf(error);
        this.serialError = invalid?.fields['nextSerialNumber'] || errorMessageOf(error, "Couldn't save the TC structure.");
        this.cdr.markForCheck();
      });
  }

  trackByNo = (_index: number, field: { no: number }): number => field.no;

  private apply(view: TcStructureView): void {
    this.structure = view;
    this.serial = view.nextSerialNumber;
  }
}
