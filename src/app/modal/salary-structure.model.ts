import { SalaryComponent } from './salary-group.model';

// Mirrors backend/modules/models/salary-structure.js.
//
// EVERY OVERRIDE IS `| null`, and null is the only "unset" value. An override of 0 is a real
// instruction (this person gets no HRA); the component must send null, never 0 or undefined,
// when the admin has not ticked "Override for this person".
export interface SalaryStructure {
  _id?: String;
  adminId?: String;
  staffId: String;
  salaryGroupId: String;
  effectiveFrom: Date | String;
  overrideBasic?: Number | null;
  overrideHra?: Number | null;
  overrideAllowances?: SalaryComponent[] | null;
  overrideDeductions?: SalaryComponent[] | null;
  createdAt?: Date;
}

// One row of the Assign Salary table — a STAFF member with their assignment attached, not a
// SalaryStructure row. Unassigned staff appear here with salaryGroupId null, which is exactly
// who the page exists to find.
export interface AssignSalaryRow {
  staffId: String;
  name: String;
  empCode: String;
  structureId: String | null;
  salaryGroupId: String | null;
  salaryGroupName: String;
  calculationMode: String;
  effectiveFrom: Date | null;
  hasOverride: Boolean;
}
