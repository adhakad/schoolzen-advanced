/** Holiday Templates (backend: models/holiday/holiday-template.js) — dated holidays only;
 *  weekly offs live in the Roster. */
export interface HolidayTemplate {
  _id: string;
  name: string;
  /** References, never copies — editing the template changes every assigned person. */
  holidayIds: string[];
  createdAt: string;
  holidayCount?: number;
  assignedCount?: number;
}

export interface HolidayTemplatePayload {
  adminId: string;
  name: string;
  holidayIds: string[];
}

export interface HolidayTemplateListResponse {
  rows: HolidayTemplate[];
  total: number;
  page: number;
  limit: number;
  summary: { total: number };
}

export interface HolidayTemplateOption {
  _id: string;
  name: string;
  holidayIds: string[];
}
