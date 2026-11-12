/** Settings → School Profile — the shapes of /api/v2/settings/school-profile. */

export interface SchoolProfile {
  schoolName: string | null;
  board: string | null;
  medium: string | null;
  affiliationNumber: string | null;
  schoolCode: string | null;
  foundedYear: number | null;
  udiseNumber: string | null;
  principalName: string | null;
  street: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pinCode: string | null;
  phoneOne: string | null;
  phoneSecond: string | null;
  email: string | null;
  website: string | null;
  senderName: string | null;
  schoolLogo: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
}

export interface BoardGroup {
  label: string;
  boards: string[];
}

/** The lists come from the backend's one constants file (helpers/settings/v2-school-profile-lists.js). */
export interface SchoolProfileResponse {
  profile: SchoolProfile | null;
  boards: BoardGroup[];
  states: string[];
  mediums: string[];
}

export type SchoolProfilePayload = Omit<SchoolProfile, 'schoolLogo' | 'updatedAt' | 'updatedByName' | 'foundedYear'> & { foundedYear: string; removeLogo?: boolean };
