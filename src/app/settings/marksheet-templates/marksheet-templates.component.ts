/**
 * Settings → Marksheet Templates — the fixed, seeded gallery of grading/layout designs (T1–T8).
 *
 * Reference: docs/schoolzen-planning/v1/settings/settings-marksheet-templates.html
 *            (+ settings-marksheet-templates.md, errors.md Page 4)
 *
 * Templates are read-only; what an admin does here is "Use This Template" for a class. The
 * consequence (other classes using it, the class's current template being replaced, a
 * missing subject group) is fetched live and shown in the modal BEFORE confirming.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { DdOption } from 'src/app/shared/models/shared-components.model';
import { MarksheetTemplatesService } from 'src/app/shared/services/settings/marksheet-templates.service';
import { AssignPreview, MarksheetTemplate } from 'src/app/shared/models/settings/marksheet-template.model';
import { ClassScopeNode } from 'src/app/shared/models/settings/roles.model';
import { toApiError } from 'src/app/shared/utils/api-error.util';

@Component({
  selector: 'app-marksheet-templates',
  templateUrl: './marksheet-templates.component.html',
  styleUrls: ['./marksheet-templates.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MarksheetTemplatesComponent implements OnInit, OnDestroy {
  adminId = '';
  loading = true;
  loadError = '';
  templates: MarksheetTemplate[] = [];
  classes: ClassScopeNode[] = [];
  /** Six placeholder rows for each card's thumbnail. */
  readonly thumbRows = [0, 1, 2, 3, 4, 5];

  viewOpen = false;
  viewing: MarksheetTemplate | null = null;

  assignOpen = false;
  assigning: MarksheetTemplate | null = null;
  classId = '';
  streamId = '';
  preview: AssignPreview | null = null;
  previewLoading = false;
  previewError = '';
  replaceConfirmed = false;
  saving = false;
  assignError = '';

  private preview$ = new Subject<{ templateId: string; classId: string; streamId: string | null }>();
  private destroyed$ = new Subject<void>();

  constructor(
    private templatesService: MarksheetTemplatesService,
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
    // switchMap: changing class mid-request never shows the previous class's warning.
    this.preview$.pipe(
      switchMap((q) => {
        this.previewLoading = true;
        this.previewError = '';
        this.cdr.markForCheck();
        return this.templatesService.getAssignPreview(this.adminId, q.templateId, q.classId, q.streamId);
      }),
      takeUntil(this.destroyed$)
    ).subscribe((preview) => {
      this.preview = preview;
      this.previewLoading = false;
      this.cdr.markForCheck();
    }, () => {
      this.previewLoading = false;
      this.previewError = "Couldn't check this class — try again.";
      this.cdr.markForCheck();
    });
    this.fetchTemplates();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  fetchTemplates(): void {
    this.loading = true;
    this.loadError = '';
    this.templatesService.getTemplates(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.templates = res.templates || [];
      this.classes = res.classes || [];
      this.loading = false;
      this.cdr.markForCheck();
    }, () => {
      this.templates = [];
      this.loadError = "Couldn't load marksheet templates.";
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  trackById = (_index: number, t: MarksheetTemplate): string => t._id;

  // --- preview ---

  onCardClick(template: MarksheetTemplate): void {
    if (template.usedBy > 0) this.openView(template);
    else this.openAssign(template);
  }

  openView(template: MarksheetTemplate): void {
    this.viewing = template;
    this.viewOpen = true;
  }

  closeView(): void {
    this.viewOpen = false;
  }

  useFromView(): void {
    const template = this.viewing;
    this.viewOpen = false;
    if (template) this.openAssign(template);
  }

  // --- assign ---

  openAssign(template: MarksheetTemplate): void {
    this.assigning = template;
    this.classId = '';
    this.streamId = '';
    this.preview = null;
    this.previewError = '';
    this.previewLoading = false;
    this.replaceConfirmed = false;
    this.assignError = '';
    this.saving = false;
    this.assignOpen = true;
  }

  get classOptions(): DdOption[] {
    return [{ value: '', label: '-- Select --' }, ...this.classes.map((cls) => ({ value: cls._id, label: cls.label }))];
  }

  private get selectedClass(): ClassScopeNode | undefined {
    return this.classes.find((cls) => cls._id === this.classId);
  }

  get needsStream(): boolean {
    return !!this.selectedClass?.hasStreams;
  }

  get streamOptions(): DdOption[] {
    const cls = this.selectedClass;
    if (!cls?.hasStreams) return [{ value: '', label: 'N/A' }];
    return [{ value: '', label: '-- Select --' }, ...cls.streams.map((st) => ({ value: st._id, label: st.label }))];
  }

  onClassChange(value: string): void {
    this.classId = value;
    this.streamId = '';
    this.requestPreview();
  }

  onStreamChange(value: string): void {
    this.streamId = value;
    this.requestPreview();
  }

  private requestPreview(): void {
    this.preview = null;
    this.replaceConfirmed = false;
    this.assignError = '';
    if (!this.assigning || !this.classId || (this.needsStream && !this.streamId)) return;
    this.preview$.next({ templateId: this.assigning._id, classId: this.classId, streamId: this.streamId || null });
  }

  get alreadyThisTemplate(): boolean {
    return !!this.preview?.existing?.sameTemplate;
  }

  get submitDisabled(): boolean {
    if (this.saving || this.previewLoading || !this.preview || this.previewError) return true;
    if (this.preview.subjectGroupMissing || this.alreadyThisTemplate) return true;
    // CLASS_TEMPLATE_ALREADY_ASSIGNED: replacing needs an explicit yes.
    return !!this.preview.existing && !this.replaceConfirmed;
  }

  onAssignCancel(): void {
    this.assignOpen = false;
  }

  onAssignSubmit(): void {
    const template = this.assigning;
    if (!template || this.submitDisabled) return;
    this.saving = true;
    this.assignError = '';
    this.templatesService.assign({
      adminId: this.adminId,
      templateId: template._id,
      classId: this.classId,
      streamId: this.streamId || null,
      replace: !!this.preview?.existing && this.replaceConfirmed
    }).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.saving = false;
      this.assignOpen = false;
      this.snackBar.open(res?.message || template.code + ' assigned.', 'Dismiss', { duration: 4000 });
      this.fetchTemplates();
    }, (error: unknown) => {
      this.saving = false;
      const apiError = toApiError(error);
      // The class changed under us (someone assigned meanwhile) — re-read and re-confirm.
      if (apiError?.code === 'CLASS_TEMPLATE_ALREADY_ASSIGNED' || apiError?.code === 'SUBJECT_GROUP_MISSING') {
        this.requestPreview();
        this.assignError = apiError.message;
      } else if (apiError?.category === 'ValidationError') {
        this.assignError = apiError.fields?.[0]?.message || apiError.message;
      }
      this.cdr.markForCheck();
    });
  }
}
