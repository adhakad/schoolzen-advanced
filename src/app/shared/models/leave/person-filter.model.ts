/**
 * Leave's shared Person Type → Department/Designation | Class/Stream/Group/Section filter
 * (README "Reuse, don't duplicate": the same cascade Attendance uses, plus Group).
 */
import { FilterClass, FilterGroup } from 'src/app/shared/models/student/student.model';
import { LeavePersonType } from './leave-request.model';

export interface PersonFilterOptions {
  departments: { _id: string; name: string }[];
  designations: { _id: string; title: string; departmentId: string | null }[];
  classes: FilterClass[];
  groups: FilterGroup[];
}

export interface PersonFilterValue {
  personType: LeavePersonType;
  departmentId: string;
  designationId: string;
  classId: string;
  streamId: string;
  groupId: string;
  sectionId: string;
}

export const EMPTY_PERSON_FILTER: PersonFilterValue = {
  personType: 'staff', departmentId: '', designationId: '', classId: '', streamId: '', groupId: '', sectionId: ''
};

export const EMPTY_FILTER_OPTIONS: PersonFilterOptions = { departments: [], designations: [], classes: [], groups: [] };
