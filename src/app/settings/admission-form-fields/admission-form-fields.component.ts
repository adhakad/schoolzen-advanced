/**
 * Settings → Admission Form Fields — which fields the Admission form shows, which are
 * required, and each field's validation rule. The ONE config the Admission form and the
 * Excel import both validate against.
 *
 * Reference: docs/schoolzen-planning/v1/settings/admission-form-fields.html (+ .md, errors.md Page 2)
 *
 * A settings form, not an auto-save table: Required/Show toggles and gear-modal rule edits
 * are STAGED and sent together by "Save Changes". Adding or deleting a custom field is its
 * own immediate action. The gear modal fetches the live affected-record count before a
 * type change or option removal is staged, so the consequence is seen before saving.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, switchMap, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ConfirmConfig, DdOption } from 'src/app/shared/models/shared-components.model';
import { AdmissionFormFieldsService } from 'src/app/shared/services/settings/admission-form-fields.service';
import {
  FieldChange, FieldConfigRow, FieldImpact, FieldRule, FieldType
} from 'src/app/shared/models/settings/field-config.model';
import { newIdempotencyKey } from 'src/app/shared/utils/idempotency.util';
import { settingsFormErrors, SETTINGS_ERROR_MESSAGES } from 'src/app/shared/utils/settings-errors.util';
import { toApiError } from 'src/app/shared/utils/api-error.util';

type RuleKind = 'number' | 'text' | 'flag';

const RULE_META: Readonly<Record<string, { label: string; kind: RuleKind }>> = {
  minLength: { label: 'Min Length', kind: 'number' },
  maxLength: { label: 'Max Length', kind: 'number' },
  pattern: { label: 'Pattern (regex)', kind: 'text' },
  min: { label: 'Minimum value', kind: 'number' },
  max: { label: 'Maximum value', kind: 'number' },
  integer: { label: 'Whole numbers only', kind: 'flag' },
  notFuture: { label: 'Cannot be a future date', kind: 'flag' }
};

/** Rule keys an admin may set per type (mirrors the backend's EDITABLE_RULE_KEYS). */
const RULE_KEYS_BY_TYPE: Readonly<Record<string, string[]>> = {
  text: ['minLength', 'maxLength', 'pattern'],
  number: ['min', 'max', 'integer'],
  date: ['notFuture'],
  dropdown: [],
  email: [],
  phone: [],
  boolean: []
};

const TYPE_LABELS: Readonly<Record<string, string>> = {
  text: 'Text', number: 'Number', dropdown: 'Dropdown (choose from list)', date: 'Date',
  email: 'Email', phone: 'Phone', boolean: 'Yes / No', file: 'File', classRef: 'Class'
};

const GROUP_LABELS: Readonly<Record<string, string>> = {
  student: 'Student Info', parents: 'Parents Info', parentsContact: 'Parents Contact', admission: 'Admission Info'
};

export interface RuleRow { key: string; value: string; }

interface StagedEdit {
  label?: string;
  required?: boolean;
  visible?: boolean;
  type?: FieldType;
  validationRule?: Partial<FieldRule>;
  acknowledgeTypeChange?: boolean;
  acknowledgeOptionRemoval?: boolean;
}

const isSet = (value: unknown): boolean => value !== undefined && value !== null && value !== '';

/** "text · max 50 characters", "choose from list", "Madhya Pradesh only · 9 digits …". */
export const describeRule = (field: Pick<FieldConfigRow, 'validationRule' | 'stateSpecific' | 'isCustom'>): string => {
  const rule = field.validationRule || ({ type: 'text' } as FieldRule);
  const parts: string[] = [];
  if (field.stateSpecific) parts.push(field.stateSpecific + ' only');
  switch (rule.type) {
    case 'text':
      parts.push('text');
      if (isSet(rule.minLength) && isSet(rule.maxLength)) parts.push(rule.minLength + '–' + rule.maxLength + ' characters');
      else if (isSet(rule.maxLength)) parts.push('max ' + rule.maxLength + ' characters');
      else if (isSet(rule.minLength)) parts.push('min ' + rule.minLength + ' characters');
      if (isSet(rule.pattern)) parts.push('must match a pattern');
      break;
    case 'number':
      parts.push(rule.integer ? 'whole numbers' : 'numeric');
      if (isSet(rule.min) && Number(rule.min) === 0) parts.push('cannot be negative');
      else if (isSet(rule.min)) parts.push('min ' + rule.min);
      if (isSet(rule.max)) parts.push('max ' + rule.max);
      break;
    case 'date':
      parts.push(rule.notFuture ? 'cannot be a future date' : 'date');
      break;
    case 'dropdown':
      parts.push('choose from list' + (rule.options?.length ? ' (' + rule.options.length + ' options)' : ''));
      break;
    case 'phone':
      parts.push('10 digits · must start with 6, 7, 8 or 9');
      break;
    case 'classRef':
      parts.push('must match a class from Academic Setup');
      break;
    default:
      parts.push(TYPE_LABELS[rule.type] ? TYPE_LABELS[rule.type].toLowerCase() : String(rule.type));
  }
  if (field.isCustom) parts.push('custom field');
  return parts.join(' · ');
};

/** Rule rows → the rule object to send: set keys get values, removed keys are cleared (null). */
export const ruleFromRows = (type: string, rows: RuleRow[], previous: Partial<FieldRule> = {}): Partial<FieldRule> => {
  const allowed = RULE_KEYS_BY_TYPE[type] || [];
  const out: Partial<FieldRule> = {};
  allowed.forEach((key) => {
    const row = rows.find((r) => r.key === key);
    const kind = RULE_META[key].kind;
    if (row) {
      if (kind === 'flag') out[key] = true;
      else if (kind === 'number') out[key] = row.value.trim() === '' ? null : Number(row.value);
      else out[key] = row.value.trim() || null;
    } else if (isSet(previous[key])) {
      out[key] = null;
    }
  });
  return out;
};

/** The modal's own checks, before anything is staged or sent. Empty when valid. */
export const ruleRowProblems = (type: string, rows: RuleRow[], options: string[]): string[] => {
  const problems: string[] = [];
  const num = (key: string): number | null => {
    const row = rows.find((r) => r.key === key);
    return row && row.value.trim() !== '' ? Number(row.value) : null;
  };
  rows.forEach((row) => {
    const meta = RULE_META[row.key];
    if (!meta) return;
    if (meta.kind === 'number' && (row.value.trim() === '' || !Number.isFinite(Number(row.value)))) {
      problems.push(meta.label + ': enter a valid number.');
    } else if (meta.kind === 'number' && (row.key === 'minLength' || row.key === 'maxLength') && Number(row.value) < 0) {
      problems.push(meta.label + ': enter a number of 0 or more.');
    }
    if (row.key === 'pattern') {
      try { new RegExp(row.value, 'u'); } catch { problems.push('Enter a valid pattern (regular expression).'); }
    }
  });
  const minL = num('minLength'); const maxL = num('maxLength');
  if (minL !== null && maxL !== null && minL > maxL) problems.push("Max length can't be less than min length.");
  const min = num('min'); const max = num('max');
  if (min !== null && max !== null && min > max) problems.push("Maximum can't be less than minimum.");
  if (type === 'dropdown' && !options.length) problems.push('Add at least one option to choose from.');
  return problems;
};

const rowsFromRule = (type: string, rule: Partial<FieldRule>, allowed?: string[]): RuleRow[] =>
  (allowed || RULE_KEYS_BY_TYPE[type] || [])
    .filter((key) => key !== 'options' && RULE_META[key])
    .filter((key) => RULE_META[key].kind === 'flag' ? rule[key] === true : isSet(rule[key]))
    .map((key) => ({ key, value: RULE_META[key].kind === 'flag' ? '' : String(rule[key]) }));

@Component({
  selector: 'app-admission-form-fields',
  templateUrl: './admission-form-fields.component.html',
  styleUrls: ['./admission-form-fields.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdmissionFormFieldsComponent implements OnInit, OnDestroy {
  adminId = '';
  loading = true;
  loadError = '';
  fields: FieldConfigRow[] = [];
  summary = { total: 0, custom: 0 };
  stateOptions: DdOption[] = [];
  selectedState = '';
  typeOptions: DdOption[] = [];
  groupOptions: DdOption[] = [];

  /** Staged, unsaved edits by fieldKey — sent together by Save Changes. */
  staged = new Map<string, StagedEdit>();
  saving = false;
  saveError = '';
  /** Per-field messages from a refused save (rows[].id = fieldKey). */
  rowErrors: Record<string, string> = {};
  configChanged = false;

  // Gear (edit) / Add Custom / Add State-Specific modal — one modal, three modes.
  modalOpen = false;
  modalMode: 'edit' | 'custom' | 'state' = 'edit';
  modalTitle = '';
  editing: FieldConfigRow | null = null;
  mLabel = '';
  mType: FieldType = 'text';
  mGroup = 'student';
  mRules: RuleRow[] = [];
  mOptions: string[] = [];
  mProblems: string[] = [];
  mFieldErrors: Record<string, string> = {};
  mFormError = '';
  mSaving = false;
  impact: FieldImpact | null = null;
  impactLoading = false;
  ackTypeChange = false;
  ackOptionRemoval = false;
  private createKey = '';
  private impact$ = new Subject<{ type?: string; options?: string[] }>();

  // Delete (custom fields only)
  confirmOpen = false;
  confirmConfig: ConfirmConfig = { title: '', message: '', confirmLabel: 'Delete' };
  private deleteTarget: FieldConfigRow | null = null;
  deletingKey = '';

  private destroyed$ = new Subject<void>();

  constructor(
    private fieldsService: AdmissionFormFieldsService,
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
    this.impact$.pipe(
      debounceTime(300),
      switchMap((change) => {
        this.impactLoading = true;
        this.cdr.markForCheck();
        return this.fieldsService.getImpact(this.adminId, this.editing?.fieldKey || '', change);
      }),
      takeUntil(this.destroyed$)
    ).subscribe((impact) => {
      this.impact = impact;
      this.impactLoading = false;
      this.cdr.markForCheck();
    }, () => {
      this.impactLoading = false;
      this.cdr.markForCheck();
    });
    this.fetchFields();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  // --- list ---------------------------------------------------------------------------

  fetchFields(): void {
    this.loading = true;
    this.loadError = '';
    this.fieldsService.getFields(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.fields = res.fields || [];
      this.summary = res.summary || { total: this.fields.length, custom: 0 };
      this.stateOptions = (res.states || []).map((state) => ({ value: state, label: state }));
      if (!this.selectedState) {
        this.selectedState = res.schoolState
          || this.fields.find((field) => field.stateSpecific)?.stateSpecific
          || (res.states || [])[0] || '';
      }
      this.typeOptions = (res.customTypes || []).map((type) => ({ value: type, label: TYPE_LABELS[type] || type }));
      this.groupOptions = (res.customGroups || []).map((group) => ({ value: group, label: GROUP_LABELS[group] || group }));
      // A staged edit made against a version that no longer exists is stale.
      this.staged.forEach((_edit, key) => {
        if (!this.fields.some((field) => field.fieldKey === key)) this.staged.delete(key);
      });
      this.loading = false;
      this.cdr.markForCheck();
    }, () => {
      this.fields = [];
      this.loadError = "Couldn't load the admission form fields.";
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  trackByField = (_index: number, field: FieldConfigRow): string => field.fieldKey;
  trackByIndex = (index: number): number => index;

  /** The field as it will be once the staged edit is saved. */
  view(field: FieldConfigRow): FieldConfigRow {
    const edit = this.staged.get(field.fieldKey);
    if (!edit) return field;
    const type = edit.type || field.validationRule.type;
    const base = type === field.validationRule.type ? field.validationRule : ({ type } as FieldRule);
    const rule = { ...base, ...(edit.validationRule || {}), type } as FieldRule;
    return {
      ...field,
      label: edit.label ?? field.label,
      required: edit.required ?? field.required,
      visible: edit.visible ?? field.visible,
      validationRule: rule
    };
  }

  describe(field: FieldConfigRow): string {
    return describeRule(this.view(field));
  }

  isStaged(field: FieldConfigRow): boolean {
    return this.staged.has(field.fieldKey);
  }

  inGroup(group: string): FieldConfigRow[] {
    return this.fields.filter((field) => field.displayGroup === group);
  }

  get stateFields(): FieldConfigRow[] {
    return this.fields.filter((field) => field.stateSpecific === this.selectedState);
  }

  get otherStateFields(): FieldConfigRow[] {
    return this.fields.filter((field) => field.stateSpecific && field.stateSpecific !== this.selectedState);
  }

  onStateChange(state: string): void {
    this.selectedState = state;
  }

  // --- staged toggles -----------------------------------------------------------------

  private stage(field: FieldConfigRow, edit: StagedEdit): void {
    const merged: StagedEdit = { ...(this.staged.get(field.fieldKey) || {}), ...edit };
    // A toggle flipped back to the saved value is no longer a change.
    if (merged.required === field.required) delete merged.required;
    if (merged.visible === field.visible) delete merged.visible;
    if (merged.label === field.label) delete merged.label;
    if (Object.keys(merged).length) this.staged.set(field.fieldKey, merged);
    else this.staged.delete(field.fieldKey);
    delete this.rowErrors[field.fieldKey];
    this.saveError = '';
  }

  onRequiredToggle(field: FieldConfigRow, checked: boolean): void {
    if (field.locked || field.fixed) return;
    this.stage(field, { required: checked });
  }

  onVisibleToggle(field: FieldConfigRow): void {
    if (field.locked || field.fixed) return;
    this.stage(field, { visible: !this.view(field).visible });
  }

  get dirtyCount(): number {
    return this.staged.size;
  }

  discardChanges(): void {
    this.staged.clear();
    this.rowErrors = {};
    this.saveError = '';
    this.configChanged = false;
  }

  onSaveChanges(): void {
    if (this.saving || !this.staged.size) return;
    const byKey = new Map(this.fields.map((field) => [field.fieldKey, field]));
    const changes: FieldChange[] = [];
    this.staged.forEach((edit, fieldKey) => {
      const field = byKey.get(fieldKey);
      if (!field) return;
      changes.push({ fieldKey, version: field.version, ...edit });
    });
    this.saving = true;
    this.saveError = '';
    this.rowErrors = {};
    this.configChanged = false;

    this.fieldsService.saveChanges(this.adminId, changes).pipe(takeUntil(this.destroyed$)).subscribe(() => {
      this.saving = false;
      this.staged.clear();
      this.snackBar.open('Admission form fields saved.', 'Dismiss', { duration: 4000 });
      this.fetchFields();
    }, (error: unknown) => {
      this.saving = false;
      const apiError = toApiError(error);
      (apiError?.rows || []).forEach((row) => {
        if (row.id) this.rowErrors[row.id] = row.message || SETTINGS_ERROR_MESSAGES[row.code || ''] || '';
      });
      this.configChanged = apiError?.code === 'FIELD_CONFIG_CHANGED';
      this.saveError = apiError?.message || '';
      this.cdr.markForCheck();
    });
  }

  /** FIELD_CONFIG_CHANGED: reload the current rules; the staged edits are dropped. */
  refreshAfterConflict(): void {
    this.discardChanges();
    this.fetchFields();
  }

  // --- modal ----------------------------------------------------------------------------

  private resetModal(): void {
    this.mProblems = [];
    this.mFieldErrors = {};
    this.mFormError = '';
    this.mSaving = false;
    this.impact = null;
    this.impactLoading = false;
    this.ackTypeChange = false;
    this.ackOptionRemoval = false;
  }

  onEditField(field: FieldConfigRow): void {
    const current = this.view(field);
    const edit = this.staged.get(field.fieldKey);
    this.resetModal();
    this.modalMode = 'edit';
    this.modalTitle = 'Edit Field';
    this.editing = field;
    this.mLabel = current.label;
    this.mType = current.validationRule.type;
    this.mRules = rowsFromRule(this.mType, current.validationRule,
      field.isCustom ? undefined : field.editableRuleKeys);
    this.mOptions = [...(current.validationRule.options || [])];
    this.ackTypeChange = !!edit?.acknowledgeTypeChange;
    this.ackOptionRemoval = !!edit?.acknowledgeOptionRemoval;
    this.modalOpen = true;
    if (field.dataCount > 0 && (this.mType !== field.validationRule.type || this.mType === 'dropdown')) this.requestImpact();
  }

  onAddCustomField(): void {
    this.resetModal();
    this.modalMode = 'custom';
    this.modalTitle = 'Add Custom Field';
    this.editing = null;
    this.mLabel = '';
    this.mType = 'text';
    this.mGroup = 'student';
    this.mRules = [];
    this.mOptions = [];
    this.createKey = newIdempotencyKey();
    this.modalOpen = true;
  }

  onAddStateField(): void {
    this.resetModal();
    this.modalMode = 'state';
    this.modalTitle = 'Add State-Specific Field — ' + this.selectedState;
    this.editing = null;
    this.mLabel = '';
    this.mType = 'text';
    this.mGroup = 'student';
    this.mRules = [];
    this.mOptions = [];
    this.createKey = newIdempotencyKey();
    this.modalOpen = true;
  }

  /** Type is changeable on custom fields only — a seeded field's type belongs to the seed. */
  get typeEditable(): boolean {
    return this.modalMode === 'custom' || (this.modalMode === 'edit' && !!this.editing?.isCustom);
  }

  typeLabel(type: string): string {
    return TYPE_LABELS[type] || type;
  }

  get availableRuleKeys(): string[] {
    const keys = this.modalMode === 'edit' && this.editing && !this.editing.isCustom
      ? this.editing.editableRuleKeys
      : RULE_KEYS_BY_TYPE[this.mType] || [];
    return keys.filter((key) => key !== 'options' && RULE_META[key]);
  }

  ruleKeyOptions(row: RuleRow): DdOption[] {
    const used = new Set(this.mRules.filter((r) => r !== row).map((r) => r.key));
    return this.availableRuleKeys.filter((key) => !used.has(key)).map((key) => ({ value: key, label: RULE_META[key].label }));
  }

  ruleKind(key: string): RuleKind {
    return RULE_META[key]?.kind || 'text';
  }

  get canAddRule(): boolean {
    return this.mRules.length < this.availableRuleKeys.length;
  }

  addRule(): void {
    const used = new Set(this.mRules.map((r) => r.key));
    const next = this.availableRuleKeys.find((key) => !used.has(key));
    if (next) this.mRules = [...this.mRules, { key: next, value: '' }];
    this.mProblems = [];
  }

  removeRule(index: number): void {
    this.mRules = this.mRules.filter((_row, i) => i !== index);
    this.mProblems = [];
  }

  setRuleKey(index: number, key: string): void {
    this.mRules = this.mRules.map((row, i) => (i === index ? { key, value: '' } : row));
  }

  setRuleValue(index: number, value: string): void {
    this.mRules = this.mRules.map((row, i) => (i === index ? { ...row, value } : row));
    this.mProblems = [];
  }

  onLabelChange(value: string): void {
    this.mLabel = value;
    delete this.mFieldErrors['label'];
  }

  onTypeChange(type: string): void {
    this.mType = type as FieldType;
    this.mRules = [];
    if (type !== 'dropdown') this.mOptions = [];
    this.mProblems = [];
    this.ackTypeChange = false;
    if (this.modalMode === 'edit' && this.editing && this.editing.dataCount > 0) this.requestImpact();
  }

  onGroupChange(group: string): void {
    this.mGroup = group;
  }

  onOptionsChange(options: string[]): void {
    this.mOptions = options;
    this.mProblems = [];
    this.ackOptionRemoval = false;
    if (this.modalMode === 'edit' && this.editing && this.editing.dataCount > 0) this.requestImpact();
  }

  private requestImpact(): void {
    if (!this.editing) return;
    const typeChanged = this.mType !== this.editing.validationRule.type;
    this.impact$.next(typeChanged ? { type: this.mType } : { options: this.mOptions });
  }

  get impactBlocks(): boolean {
    return !!this.impact?.typeChange?.blocked;
  }

  get modalSubmitDisabled(): boolean {
    if (this.mSaving || !this.mLabel.trim() || this.impactLoading || this.impactBlocks) return true;
    if (this.impact?.typeChange && !this.ackTypeChange) return true;
    if (this.impact?.optionRemoval && !this.ackOptionRemoval) return true;
    return false;
  }

  get modalSubmitLabel(): string {
    return this.modalMode === 'state' ? 'Add Field' : 'Save Field';
  }

  onModalCancel(): void {
    this.modalOpen = false;
    this.editing = null;
  }

  onModalSubmit(): void {
    if (this.modalSubmitDisabled) return;
    this.mProblems = ruleRowProblems(this.mType, this.mRules, this.mOptions);
    if (this.mProblems.length) return;

    if (this.modalMode === 'edit') {
      this.stageEdit();
      return;
    }
    this.createField();
  }

  /** Gear edits are staged, not saved — Save Changes sends them with everything else. */
  private stageEdit(): void {
    const field = this.editing;
    if (!field) return;
    const typeChanged = this.mType !== field.validationRule.type;
    const previous = typeChanged ? {} : field.validationRule;
    const rule = ruleFromRows(this.mType, this.mRules, previous);
    if (this.mType === 'dropdown') rule.options = [...this.mOptions];

    const edit: StagedEdit = { label: this.mLabel.trim() };
    const ruleChanged = typeChanged || Object.keys(rule).some((key) =>
      JSON.stringify(rule[key] ?? null) !== JSON.stringify(field.validationRule[key] ?? null));
    if (ruleChanged) edit.validationRule = rule;
    else {
      const existing = this.staged.get(field.fieldKey);
      if (existing) { delete existing.validationRule; delete existing.type; }
    }
    if (typeChanged) edit.type = this.mType;
    if (this.impact?.typeChange) edit.acknowledgeTypeChange = this.ackTypeChange;
    if (this.impact?.optionRemoval) edit.acknowledgeOptionRemoval = this.ackOptionRemoval;
    this.stage(field, edit);
    this.modalOpen = false;
    this.editing = null;
  }

  private createField(): void {
    this.mSaving = true;
    this.mFieldErrors = {};
    this.mFormError = '';
    const rule = ruleFromRows(this.mType, this.mRules);
    if (this.mType === 'dropdown') rule.options = [...this.mOptions];
    this.fieldsService.createField({
      adminId: this.adminId,
      label: this.mLabel.trim(),
      type: this.mType,
      group: this.modalMode === 'state' ? 'student' : this.mGroup,
      stateSpecific: this.modalMode === 'state' ? this.selectedState : null,
      required: false,
      visible: true,
      validationRule: rule
    }, this.createKey).pipe(takeUntil(this.destroyed$)).subscribe(() => {
      this.mSaving = false;
      this.modalOpen = false;
      this.snackBar.open('Field added.', 'Dismiss', { duration: 4000 });
      this.fetchFields();
    }, (error: unknown) => {
      this.mSaving = false;
      const inline = settingsFormErrors(error, ['label', 'type', 'stateSpecific']);
      if (inline) {
        this.mFieldErrors = inline.fields;
        this.mFormError = inline.formError;
      }
      this.cdr.markForCheck();
    });
  }

  // --- delete (custom fields) --------------------------------------------------------

  onDeleteField(field: FieldConfigRow): void {
    this.deleteTarget = field;
    const count = field.dataCount || 0;
    this.confirmConfig = {
      title: 'Delete "' + field.label + '"?',
      message: count > 0
        ? count + (count === 1 ? ' student record has' : ' student records have')
          + ' data in this field — hiding it is reversible, deleting it is not.'
        : "This custom field will be removed from the Admission form. This can't be undone.",
      scopeNote: count > 0 ? 'Hide the field instead to keep that data.' : undefined,
      confirmLabel: 'Delete',
      variant: 'warning',
      typeToConfirm: 'DELETE',
      blocked: count > 0
    };
    this.confirmOpen = true;
  }

  onDeleteConfirmed(): void {
    this.confirmOpen = false;
    const target = this.deleteTarget;
    this.deleteTarget = null;
    if (!target || this.deletingKey) return;
    this.deletingKey = target.fieldKey;
    this.fieldsService.deleteField(this.adminId, target.fieldKey).pipe(takeUntil(this.destroyed$)).subscribe(() => {
      this.deletingKey = '';
      this.staged.delete(target.fieldKey);
      this.snackBar.open('Field deleted.', 'Dismiss', { duration: 4000 });
      this.fetchFields();
    }, () => {
      this.deletingKey = '';
      this.fetchFields();
    });
  }

  onDeleteCancelled(): void {
    this.confirmOpen = false;
    this.deleteTarget = null;
  }
}
