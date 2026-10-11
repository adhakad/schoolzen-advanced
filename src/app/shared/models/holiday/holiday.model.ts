/** Holidays — the school's master list (backend: models/holiday/holiday.js). */
export type HolidaySource = 'manual' | 'auto';

export interface Holiday {
  _id: string;
  name: string;
  /** "YYYY-MM-DD" */
  startDate: string;
  endDate: string;
  days: number;
  /** 'auto' = cloned by "Generate from Public Holidays". */
  source: HolidaySource;
}

export interface HolidayPayload {
  adminId: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface HolidayListResponse {
  rows: Holiday[];
  total: number;
  page: number;
  limit: number;
  summary: { total: number; auto: number };
}

export interface SystemHolidayState {
  state: string;
  years: number[];
}

/** One official public holiday from the system dataset (Generate's preview list). */
export interface SystemHolidayEntry {
  name: string;
  /** 'YYYY-MM-DD'. */
  date: string;
}

export interface GenerateResponse {
  message: string;
  inserted: number;
  skipped: number;
}
