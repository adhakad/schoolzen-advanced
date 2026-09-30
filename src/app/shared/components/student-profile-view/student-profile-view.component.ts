/**
 * app-student-profile-view — the read-only student profile: a photo/name header, then
 * grouped label+value grids. A profile DISPLAY, never a form (manage-students.md).
 *
 * Two variants, one component, because the references show the same visual pattern with
 * different sections:
 *   'profile'   — Manage Students' "Student Profile": Academic / Personal / Parents Info
 *   'admission' — Admission's "Admission Profile": Admission / Student / Parents Info, with
 *                 admission-specific fields (Class Applied For, Admission Fee, Concession)
 *
 * Aadhar / Bank A/C / IFSC / PEN arrive MASKED from the server. Each has its own eye
 * toggle that reveals just that field — through a logged server call — for as long as the
 * modal stays open; a new `detail` (the modal closing or opening another student) resets
 * every field to masked. Hiding a revealed field again is local and isn't logged.
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { Subscription } from 'rxjs';
import { SensitiveField, StudentDetail, StudentProfile } from 'src/app/shared/models/student/student.model';
import { ManageStudentsService } from 'src/app/shared/services/student/manage-students.service';
import { avatarGradient, initialsOf } from 'src/app/shared/utils/avatar.util';

export type ProfileViewVariant = 'profile' | 'admission';

interface ViewItem {
  label: string;
  value: string;
  /** Spans the whole row (Address). */
  full?: boolean;
  /** A masked identifier with its own reveal toggle. */
  sensitive?: SensitiveField;
}

interface ViewSection {
  title: string;
  items: ViewItem[];
}

const DASH = '—';

const text = (value: unknown): string =>
  value === null || value === undefined || value === '' ? DASH : String(value);

const formatDate = (value: unknown): string => {
  if (!value) return DASH;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? DASH
    : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const rupees = (value: unknown): string =>
  value === null || value === undefined || value === '' ? DASH : '₹ ' + Number(value).toLocaleString('en-IN');

const person = (name: unknown, occupation: unknown): string =>
  [name, occupation].filter((part) => part).join(' · ') || DASH;

@Component({
  selector: 'app-student-profile-view',
  templateUrl: './student-profile-view.component.html',
  styleUrls: ['./student-profile-view.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StudentProfileViewComponent implements OnChanges, OnDestroy {
  @Input() detail: StudentDetail | null = null;
  @Input() variant: ProfileViewVariant = 'profile';
  /** The school, for the reveal call (tenant-scoped server-side). */
  @Input() adminId = '';

  /** Revealed values by field — cleared whenever `detail` changes. */
  revealed: Partial<Record<SensitiveField, string>> = {};
  /** Reveals in flight — per field, so one never blocks another. */
  revealing = new Set<SensitiveField>();
  revealError: Partial<Record<SensitiveField, string>> = {};
  private revealSubs: Subscription[] = [];

  initials = '?';
  gradient = '';
  name = '';
  meta = '';
  photoUrl: string | null = null;
  sections: ViewSection[] = [];

  constructor(private api: ManageStudentsService, private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['detail']) this.resetReveals();
    const student = this.detail?.student;
    if (!student) {
      this.sections = [];
      return;
    }
    const placement = this.detail?.placement || null;

    this.name = student.name;
    this.initials = initialsOf(student.name);
    this.gradient = avatarGradient(student._id);
    this.photoUrl = student.photoUrl;

    const metaParts = [
      student.admissionNo != null ? 'Admission No. ' + student.admissionNo : 'Admission No. not yet issued',
      placement ? 'Class ' + placement.className : null,
      this.variant === 'profile' && placement?.sectionName ? 'Section ' + placement.sectionName : null,
      placement?.rollNumber != null ? 'Roll No. ' + placement.rollNumber : null
    ];
    this.meta = metaParts.filter(Boolean).join(' · ');

    this.sections = this.variant === 'admission'
      ? this.admissionSections(student)
      : this.profileSections(student);
  }

  ngOnDestroy(): void {
    this.resetReveals();
  }

  /** The eye toggle: reveal (logged, server) or hide again (local, not logged). */
  toggleReveal(field: SensitiveField): void {
    if (this.revealed[field] !== undefined) {
      const next = { ...this.revealed };
      delete next[field];
      this.revealed = next;
      return;
    }
    const studentId = this.detail?.student._id;
    if (!studentId || this.revealing.has(field)) return;
    this.revealing.add(field);
    this.revealError = { ...this.revealError, [field]: '' };
    this.revealSubs.push(this.api.revealField(this.adminId, studentId, field).subscribe((res) => {
      this.revealing.delete(field);
      this.revealed = { ...this.revealed, [field]: res.value || DASH };
      this.cdr.markForCheck();
    }, () => {
      this.revealing.delete(field);
      this.revealError = { ...this.revealError, [field]: "Couldn't reveal — try again." };
      this.cdr.markForCheck();
    }));
  }

  /** What a row shows: the revealed value while revealed, else the (masked) value. */
  shown(item: ViewItem): string {
    const revealed = item.sensitive ? this.revealed[item.sensitive] : undefined;
    return revealed !== undefined ? revealed : item.value;
  }

  isRevealed(item: ViewItem): boolean {
    return Boolean(item.sensitive) && this.revealed[item.sensitive as SensitiveField] !== undefined;
  }

  private resetReveals(): void {
    this.revealSubs.forEach((sub) => sub.unsubscribe());
    this.revealSubs = [];
    this.revealed = {};
    this.revealing.clear();
    this.revealError = {};
  }

  /** Fee values come from the fee record once it exists — it's Fees-module truth. */
  private feeValue(key: 'concession' | 'admissionFee', snapshot: unknown): string {
    const record = this.detail?.feeRecord;
    return rupees(record ? record[key] : snapshot);
  }

  private profileSections(s: StudentProfile): ViewSection[] {
    return [
      {
        title: 'Academic Info',
        items: [
          { label: 'Session', value: text(this.detail?.placement?.session) },
          { label: 'Medium', value: text(s.medium) },
          { label: 'Date of Admission', value: formatDate(s.doa) },
          { label: 'First Enrolled Class', value: text(s.admissionClassLabel) },
          { label: 'Fees Concession', value: this.feeValue('concession', s.feesConcession) },
          { label: 'Last School', value: text(s.lastSchool) }
        ]
      },
      {
        title: 'Personal Info',
        items: [
          { label: 'Date of Birth', value: formatDate(s.dob) },
          { label: 'Gender', value: text(s.gender) },
          { label: 'Category', value: text(s.category) },
          { label: 'Religion', value: text(s.religion) },
          { label: 'Nationality', value: text(s.nationality) },
          { label: 'Aadhar Number', value: text(s.aadharNumber), sensitive: 'aadharNumber' },
          { label: 'PEN', value: text(s.penNumber), sensitive: 'penNumber' },
          { label: 'Bank A/C Number', value: text(s.bankAccountNo), sensitive: 'bankAccountNo' },
          { label: 'Bank IFSC Code', value: text(s.bankIfscCode), sensitive: 'bankIfscCode' },
          { label: 'Address', value: text(s.address), full: true }
        ]
      },
      {
        title: 'Parents Info',
        items: [
          { label: 'Father', value: person(s.fatherName, s.fatherOccupation) },
          { label: 'Mother', value: person(s.motherName, s.motherOccupation) },
          { label: 'Family Annual Income', value: rupees(s.familyAnnualIncome) },
          { label: 'Contact', value: text(s.parentsContact) }
        ]
      }
    ];
  }

  private admissionSections(s: StudentProfile): ViewSection[] {
    const placement = this.detail?.placement;
    return [
      {
        title: 'Admission Info',
        items: [
          { label: 'Session', value: text(placement?.session) },
          { label: 'Medium', value: text(s.medium) },
          { label: 'Class Applied for', value: text(placement?.className) },
          { label: 'Stream', value: placement?.streamName || 'N/A' },
          { label: 'Admission Fee', value: this.feeValue('admissionFee', s.admissionFee) },
          { label: 'Fees Concession', value: this.feeValue('concession', s.feesConcession) }
        ]
      },
      {
        title: 'Student Info',
        items: [
          { label: 'Date of Birth', value: formatDate(s.dob) },
          { label: 'Gender', value: text(s.gender) },
          { label: 'Category', value: text(s.category) },
          { label: 'Religion', value: text(s.religion) }
        ]
      },
      {
        title: 'Parents Info',
        items: [
          { label: 'Father', value: person(s.fatherName, s.fatherOccupation) },
          { label: 'Mother', value: person(s.motherName, s.motherOccupation) }
        ]
      }
    ];
  }

  trackByTitle = (_index: number, section: ViewSection): string => section.title;
  trackByLabel = (_index: number, item: ViewItem): string => item.label;
}
