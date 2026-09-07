/**
 * The sidebar's 13 module groups — the single source of truth for shell navigation,
 * matching docs/schoolzen-planning/v1/_core/shell/app-shell.html exactly (order, labels,
 * icons, and which entries are admin-only vs. permission-gated).
 *
 * Two distinct role behaviours, both from the legacy shells and both preserved here:
 *  - `adminOnly`      → the entry is REMOVED for a teacher. Their role simply has no
 *                       route for it (Staff, Academic Setup, Holiday, Settings, and
 *                       specific items like Fee Structure or Roster).
 *  - `permission: key`→ the entry stays VISIBLE for a teacher but renders locked (grey,
 *                       lock icon, no navigation) when that permission is false, so they
 *                       can see the feature exists and ask for access.
 *
 * Routes point at /v2/<module>/<page>; each later page prompt registers its own child
 * route under the /v2 shell. Until one exists, the v2 wildcard route answers with a
 * "not built yet" placeholder inside the shell.
 */
import { ShellPermissionKey } from 'src/app/shared/models/shell-context.model';

export interface ShellNavItem {
  label: string;
  route: string;
  /** Removed entirely for a teacher. */
  adminOnly?: boolean;
  /** Shown locked for a teacher when this permission is false. */
  permission?: ShellPermissionKey;
}

export interface ShellNavGroup {
  /** Stable key used for accordion state and active-group detection. */
  key: string;
  label: string;
  /** Tabler icon name without the `ti-` prefix. */
  icon: string;
  /** A single item with no children (Dashboard, Approvals). */
  route?: string;
  items?: readonly ShellNavItem[];
  /** The whole group is removed for a teacher. */
  adminOnly?: boolean;
}

export const SHELL_NAV: readonly ShellNavGroup[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'home', route: '/v2/dashboard' },

  {
    key: 'student', label: 'Student', icon: 'school',
    items: [
      { label: 'Manage Students', route: '/v2/student/manage-students', permission: 'student' },
      { label: 'Admission', route: '/v2/student/admission', permission: 'admission' },
      { label: 'Class Promotion', route: '/v2/student/class-promotion', permission: 'promoteFail' }
    ]
  },

  {
    key: 'staff', label: 'Staff', icon: 'users',
    items: [
      { label: 'Manage Staff', route: '/v2/staff/manage-staff', adminOnly: true },
      { label: 'Departments', route: '/v2/staff/departments', adminOnly: true },
      { label: 'Designations', route: '/v2/staff/designations', adminOnly: true }
    ]
  },

  {
    key: 'academic', label: 'Academic Setup', icon: 'books', adminOnly: true,
    items: [
      { label: 'Classes & Sections', route: '/v2/academic-setup/classes-sections' },
      { label: 'Subjects', route: '/v2/academic-setup/subjects' },
      { label: 'Subject Groups', route: '/v2/academic-setup/subject-groups' }
    ]
  },

  {
    key: 'attendance', label: 'Attendance', icon: 'calendar',
    items: [
      { label: 'Overview', route: '/v2/attendance/overview', permission: 'attendance' },
      { label: 'Manage Shifts', route: '/v2/attendance/shifts', adminOnly: true },
      { label: 'Roster', route: '/v2/attendance/roster', adminOnly: true }
    ]
  },

  {
    key: 'leave', label: 'Leave', icon: 'calendar-plus',
    items: [
      { label: 'Requests', route: '/v2/leave/requests' },
      { label: 'Leave Create', route: '/v2/leave/create', adminOnly: true },
      { label: 'Leave Assign', route: '/v2/leave/assign', adminOnly: true }
    ]
  },

  {
    key: 'holiday', label: 'Holiday', icon: 'sun', adminOnly: true,
    items: [
      { label: 'Holidays', route: '/v2/holiday/holidays' },
      { label: 'Templates', route: '/v2/holiday/templates' },
      { label: 'Assign', route: '/v2/holiday/assign' }
    ]
  },

  {
    key: 'payroll', label: 'Payroll', icon: 'cash',
    items: [
      { label: 'Generate Payroll', route: '/v2/payroll/generate-payroll', permission: 'salary' },
      { label: 'Salary Payouts', route: '/v2/payroll/salary-payouts', permission: 'salary' },
      { label: 'Salary Groups', route: '/v2/payroll/salary-groups', adminOnly: true },
      { label: 'Assign Salary', route: '/v2/payroll/assign-salary', adminOnly: true }
    ]
  },

  {
    key: 'fees', label: 'Fees', icon: 'cash-banknote',
    items: [
      { label: 'Fees', route: '/v2/fees/fees', permission: 'fee' },
      { label: 'Fee Structure', route: '/v2/fees/fee-structure', adminOnly: true },
      { label: 'Fee Statement', route: '/v2/fees/fee-statement', permission: 'fee' },
      { label: 'Fee Reminder', route: '/v2/fees/fee-reminder', adminOnly: true }
    ]
  },

  {
    key: 'examination', label: 'Examination', icon: 'certificate',
    items: [
      { label: 'Marksheet Structure', route: '/v2/examination/marksheet-structure', adminOnly: true },
      { label: 'Generate Marksheet', route: '/v2/examination/generate-marksheet', permission: 'marksheet' },
      { label: 'Admit Card Structure', route: '/v2/examination/admit-card-structure', adminOnly: true },
      { label: 'Generate Admit Card', route: '/v2/examination/generate-admit-card', permission: 'admitCard' }
    ]
  },

  {
    key: 'certificates', label: 'Certificates', icon: 'file-certificate',
    items: [
      { label: 'TC Structure', route: '/v2/certificates/tc-structure', adminOnly: true },
      { label: 'Generate TC', route: '/v2/certificates/generate-tc', permission: 'transferCertificate' }
    ]
  },

  { key: 'approvals', label: 'Approvals', icon: 'checkbox', route: '/v2/approvals' },

  {
    key: 'settings', label: 'Settings', icon: 'settings', adminOnly: true,
    items: [
      { label: 'Academic Sessions', route: '/v2/settings/academic-sessions' },
      { label: 'Admission Form Fields', route: '/v2/settings/admission-form-fields' },
      { label: 'Roles & Permissions', route: '/v2/settings/roles-permissions' }
    ]
  }
];
