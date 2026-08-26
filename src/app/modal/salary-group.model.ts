// Mirrors backend/modules/models/salary-group.js.
//
// calculationMode is the raw enum ('perMonth' | 'perDay') as stored. The plain-language
// "Per Month" / "Per Day" the user sees is produced by modeLabel() in the payroll component —
// the raw value never reaches a template.
export interface SalaryComponent {
  name: String;
  amount: Number;
}

export interface SalaryGroup {
  _id?: String;
  adminId?: String;
  name: String;
  basic: Number;
  hra: Number;
  allowances: SalaryComponent[];
  deductions: SalaryComponent[];
  calculationMode: String;
  status: String;
  createdAt?: Date;
}
