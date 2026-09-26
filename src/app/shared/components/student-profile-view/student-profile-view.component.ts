/**
 * app-student-profile-view — the read-only student profile: a photo/name header, then
 * grouped label+value grids. A profile DISPLAY, never a form (manage-students.md).
 *
 * Two variants, one component, because the references show the same visual pattern with
 * different sections:
 *   'profile'   — Manage Students' "Student Profile": Academic / Personal / Parents Info
 *   'admission' — Admission's "Admission Profile": Admission / Student / Parents Info, with
 *                 admission-specific fields (Class Applied For, Admission Fee, Concession)
 */
import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';
import { ClassSuffixPipe } from 'src/app/pipes/class-suffix.pipe';
import { StudentDetail, StudentProfile } from 'src/app/shared/models/student/student.model';
import { avatarGradient, initialsOf } from 'src/app/shared/utils/avatar.util';

export type ProfileViewVariant = 'profile' | 'admission';

interface ViewItem {
  label: string;
  value: string;
  /** Spans the whole row (Address). */
  full?: boolean;
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

/** "XXXX-XXXX-4821" — the full number is never needed on a read-only view. */
const maskAadhar = (value: unknown): string => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 4 ? 'XXXX-XXXX-' + digits.slice(-4) : DASH;
};

const person = (name: unknown, occupation: unknown): string =>
  [name, occupation].filter((part) => part).join(' · ') || DASH;

@Component({
  selector: 'app-student-profile-view',
  templateUrl: './student-profile-view.component.html',
  styleUrls: ['./student-profile-view.component.css'],
  providers: [ClassSuffixPipe],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StudentProfileViewComponent implements OnChanges {
  @Input() detail: StudentDetail | null = null;
  @Input() variant: ProfileViewVariant = 'profile';

  initials = '?';
  gradient = '';
  name = '';
  meta = '';
  photoUrl: string | null = null;
  sections: ViewSection[] = [];

  constructor(private classSuffix: ClassSuffixPipe) {}

  ngOnChanges(): void {
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

  private classLabel(value: unknown): string {
    return value === null || value === undefined || value === '' ? DASH : (this.classSuffix.transform(Number(value)) || String(value));
  }

  private profileSections(s: StudentProfile): ViewSection[] {
    return [
      {
        title: 'Academic Info',
        items: [
          { label: 'Session', value: text(this.detail?.placement?.session || s.admissionSession) },
          { label: 'Medium', value: text(s.medium) },
          { label: 'Date of Admission', value: formatDate(s.doa) },
          { label: 'First Enrolled Class', value: this.classLabel(s.admissionClass) },
          { label: 'Fees Concession', value: rupees(s.feesConcession) },
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
          { label: 'Aadhar Number', value: maskAadhar(s.aadharNumber) },
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
          { label: 'Session', value: text(s.admissionSession) },
          { label: 'Medium', value: text(s.medium) },
          { label: 'Class Applied for', value: text(placement?.className) },
          { label: 'Stream', value: placement?.streamName || 'N/A' },
          { label: 'Admission Fee', value: rupees(s.admissionFee) },
          { label: 'Fees Concession', value: rupees(s.feesConcession) }
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
