/** Holiday Templates (backend: models/holiday/holiday-template.js). */
export interface HolidayTemplate {
  _id: string;
  name: string;
  /** References, never copies — editing the template changes every assigned person. */
  holidayIds: string[];
  /** 0 = Sunday … 6 = Saturday. */
  weeklyOffDays: number[];
  /** The school's fallback for anyone with no template; can't be deleted. */
  isDefault: boolean;
  createdAt: string;
  holidayCount?: number;
  assignedCount?: number;
}

export interface HolidayTemplatePayload {
  adminId: string;
  name: string;
  holidayIds: string[];
  weeklyOffDays: number[];
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
  isDefault: boolean;
}

export const WEEKDAY_SHORT: readonly string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
