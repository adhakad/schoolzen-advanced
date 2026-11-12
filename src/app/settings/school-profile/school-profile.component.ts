/**
 * Settings → School Profile — one form, always edited in place, with a live letterhead preview.
 *
 * Reference: docs/schoolzen-planning/v1/settings/school-profile.html (+ school-profile.md)
 *
 * One record per school. The preview uses the SAME text rules as the printed letterhead
 * (backend helpers/settings/v2-school-profile-lists.js letterheadLines()). No table, no
 * Create/Delete: the record is created on the first save and updated afterwards.
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { SchoolProfileService } from 'src/app/shared/services/settings/school-profile.service';
import { BoardGroup, SchoolProfile, SchoolProfilePayload } from 'src/app/shared/models/settings/school-profile.model';
import { errorMessageOf, validationErrorsOf } from 'src/app/shared/utils/api-error.util';

const LOGO_MAX_BYTES = 100 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Up to two initials, "S" when empty — the html's ini(). */
export const initialsOf = (name: string): string =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'S';

/** "Central Board of Secondary Education (CBSE)" -> "CBSE". */
export const boardShort = (board: string): string => {
  const m = String(board || '').match(/\(([^)]+)\)$/);
  return m ? m[1] : String(board || '');
};

/** The letterhead text lines — mirror of the backend's letterheadLines(). */
export const letterheadLines = (p: Partial<Record<string, string | null>>): { sub: string; address: string; contact: string } => {
  const sub = [
    p['board'] ? boardShort(p['board']) : '',
    p['affiliationNumber'] ? `Affil./Recog. No. ${p['affiliationNumber']}` : '',
    p['schoolCode'] ? `School Code ${p['schoolCode']}` : ''
  ].filter(Boolean).join(' · ');
  const address = [p['street'], p['city'], p['district'] !== p['city'] ? p['district'] : '', p['state']].filter(Boolean).join(', ')
    + (p['pinCode'] ? ` - ${p['pinCode']}` : '');
  const contact = [p['phoneOne'], p['email']].filter(Boolean).join(' · ');
  return { sub, address, contact };
};

@Component({
  selector: 'app-school-profile',
  templateUrl: './school-profile.component.html',
  styleUrls: ['./school-profile.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SchoolProfileComponent implements OnInit, OnDestroy {
  adminId = '';
  loading = true;
  loadError = '';
  boards: BoardGroup[] = [];
  states: string[] = [];
  mediums: string[] = [];
  profile: SchoolProfile | null = null;

  isClick = false;
  serverErrors: Record<string, string> = {};
  saveError = '';
  toastVisible = false;

  logoFile: File | null = null;
  logoPreview: string | null = null;
  logoError = '';
  logoChanged = false;

  form: FormGroup;

  private destroyed$ = new Subject<void>();
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private objectUrl: string | null = null;

  constructor(
    private fb: FormBuilder,
    private api: SchoolProfileService,
    private adminAuthService: AdminAuthService,
    private cdr: ChangeDetectorRef
  ) {
    const req = (max: number) => ['', [Validators.required, Validators.maxLength(max), Validators.pattern(/\S/)]];
    this.form = this.fb.group({
      schoolName: req(50),
      board: ['', Validators.required],
      medium: ['English', Validators.required],
      affiliationNumber: req(15),
      schoolCode: req(15),
      foundedYear: ['', [Validators.required, Validators.pattern(/^(19|20)\d{2}$/)]],
      udiseNumber: ['', Validators.pattern(/^\d{11}$/)],
      principalName: ['', Validators.maxLength(50)],
      street: req(100),
      city: req(50),
      district: req(50),
      state: ['', Validators.required],
      pinCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      phoneOne: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
      phoneSecond: ['', Validators.pattern(/^\d{10}$/)],
      email: ['', [Validators.required, Validators.pattern(EMAIL)]],
      website: ['', Validators.maxLength(100)],
      senderName: req(50)
    });
  }

  ngOnInit(): void {
    this.adminId = this.adminAuthService.getLoggedInAdminInfo()?.id || '';
    // Sender name follows the School Name until the admin edits it (school-profile.md default).
    this.form.get('schoolName')!.valueChanges.pipe(takeUntil(this.destroyed$)).subscribe((name: string) => {
      const sender = this.form.get('senderName')!;
      if (!this.profile?.senderName && !sender.dirty) sender.setValue(name, { emitEvent: false });
    });
    this.form.valueChanges.pipe(takeUntil(this.destroyed$)).subscribe(() => {
      this.serverErrors = {};
      this.cdr.markForCheck();
    });
    this.fetch();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
  }

  fetch(): void {
    if (!this.adminId) {
      this.loading = false;
      this.loadError = "Couldn't load the school profile.";
      return;
    }
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.api.get(this.adminId).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.boards = res.boards || [];
      this.states = res.states || [];
      this.mediums = res.mediums || [];
      this.applyProfile(res.profile);
      this.loading = false;
      this.cdr.markForCheck();
    }, () => {
      this.loading = false;
      this.loadError = "Couldn't load the school profile.";
      this.cdr.markForCheck();
    });
  }

  private applyProfile(profile: SchoolProfile | null): void {
    this.profile = profile;
    if (profile) {
      const value: Record<string, string> = {};
      Object.keys(this.form.controls).forEach((key) => {
        const v = (profile as unknown as Record<string, unknown>)[key];
        value[key] = v == null ? '' : String(v);
      });
      if (!value['medium']) value['medium'] = 'English';
      this.form.setValue(value, { emitEvent: false });
    }
    this.logoFile = null;
    this.logoChanged = false;
    this.logoPreview = profile?.schoolLogo || null;
    this.form.markAsPristine();
  }

  // --- preview ---

  get v(): Record<string, string> {
    return this.form.getRawValue();
  }

  get displayName(): string {
    return (this.v['schoolName'] || '').trim() || 'SCHOOL';
  }

  get initials(): string {
    return initialsOf(this.displayName);
  }

  get lines(): { sub: string; address: string; contact: string } {
    return letterheadLines(this.v);
  }

  // --- logo ---

  onLogoPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      this.logoError = 'Only JPG/PNG images are allowed.';
    } else if (file.size > LOGO_MAX_BYTES) {
      this.logoError = 'Logo must be 100 KB or smaller.';
    } else {
      this.logoError = '';
      this.logoFile = file;
      this.logoChanged = true;
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = URL.createObjectURL(file);
      this.logoPreview = this.objectUrl;
    }
    this.cdr.markForCheck();
  }

  // --- save ---

  showError(key: string): string {
    if (this.serverErrors[key]) return this.serverErrors[key];
    const c = this.form.get(key);
    if (!c || !c.invalid || !(c.dirty || c.touched)) return '';
    const e = c.errors || {};
    if (e['maxlength']) return `Use at most ${e['maxlength'].requiredLength} characters.`;
    const messages: Record<string, string> = {
      schoolName: 'Enter the school name.', board: 'Pick a board from the list.', medium: 'Pick a medium.',
      affiliationNumber: 'Enter the affiliation / recognition number.', schoolCode: 'Enter the school code.',
      foundedYear: 'Four digits, starting with 19 or 20.', udiseNumber: 'UDISE number is 11 digits.',
      street: 'Enter the street.', city: 'Enter the city / town.', district: 'Enter the district.',
      state: 'Pick a state from the list.', pinCode: 'Pin code is exactly 6 digits.',
      phoneOne: '10 digits, numbers only.', phoneSecond: '10 digits, numbers only.', email: 'Enter a valid email.',
      senderName: 'Enter the sender name.'
    };
    return messages[key] || 'Check this field.';
  }

  get canSave(): boolean {
    return this.form.valid && !this.isClick && (this.form.dirty || this.logoChanged);
  }

  get metaLine(): string {
    const p = this.profile;
    if (!p || !p.updatedAt) return 'Not saved yet';
    const at = new Date(p.updatedAt);
    const when = Date.now() - at.getTime() < 60000
      ? 'just now'
      : at.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    return `Last saved ${when}${p.updatedByName ? ` by ${p.updatedByName}` : ''}`;
  }

  saveProfile(): void {
    if (!this.canSave) return;
    this.isClick = true;
    this.saveError = '';
    this.serverErrors = {};
    this.cdr.markForCheck();
    const raw = this.form.getRawValue();
    const payload = Object.keys(raw).reduce((out, key) => ({ ...out, [key]: String(raw[key] ?? '').trim() }), {}) as SchoolProfilePayload;
    this.api.save(this.adminId, payload, this.logoFile).pipe(takeUntil(this.destroyed$)).subscribe((res) => {
      this.isClick = false;
      this.applyProfile(res.profile);
      this.showToast();
      this.cdr.markForCheck();
    }, (error) => {
      this.isClick = false;
      const inline = validationErrorsOf(error);
      if (inline) {
        this.serverErrors = inline.fields;
        if (inline.fields['logo']) this.logoError = inline.fields['logo'];
        this.saveError = inline.message;
      } else {
        this.saveError = errorMessageOf(error, "Couldn't save the school profile.");
      }
      this.cdr.markForCheck();
    });
  }

  private showToast(): void {
    this.toastVisible = true;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastVisible = false;
      this.cdr.markForCheck();
    }, 2200);
  }
}
