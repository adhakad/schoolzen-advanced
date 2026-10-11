/**
 * Leave's Person Type filter — the two toolbar rows Requests and Assign share
 * (leave-requests.md / leave-assign.md: "same shape/filters"):
 *   row 1: a 6-column grid — Person Type, Department, Designation, Class, Stream, Group
 *   row 2: Section, then whatever the page projects (Leave Type, Status, month…)
 *
 * Staff mode enables Department → Designation; Student mode enables Class → Stream → Group →
 * Section. The other side stays visible but disabled (greyed, never hidden), and changing a
 * parent resets its children. Emits the whole value on every change.
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, HostBinding, Input, OnChanges, Output
} from '@angular/core';
import { DdOption } from 'src/app/shared/models/shared-components.model';
import { FilterClass } from 'src/app/shared/models/student/student.model';
import {
  EMPTY_FILTER_OPTIONS, EMPTY_PERSON_FILTER, PersonFilterOptions, PersonFilterValue
} from 'src/app/shared/models/leave/person-filter.model';

const titleCase = (text: string): string => (text || '').replace(/\b\w/g, (c) => c.toUpperCase());

@Component({
  selector: 'app-person-filter',
  templateUrl: './person-filter.component.html',
  styleUrls: ['./person-filter.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PersonFilterComponent implements OnChanges {
  @Input() options: PersonFilterOptions = EMPTY_FILTER_OPTIONS;
  @Input() value: PersonFilterValue = EMPTY_PERSON_FILTER;
  /** Leave Assign's student rows are classes: Group narrows nothing there. */
  @Input() showGroup = true;
  @Output() valueChange = new EventEmitter<PersonFilterValue>();

  @HostBinding('style.display') readonly display = 'contents';

  readonly personTypeOptions: readonly DdOption[] = [
    { value: 'staff', label: 'Staff' },
    { value: 'student', label: 'Student' }
  ];
  departmentOptions: DdOption[] = [];
  designationOptions: DdOption[] = [];
  classOptions: DdOption[] = [];
  streamOptions: DdOption[] = [];
  groupOptions: DdOption[] = [];
  sectionOptions: DdOption[] = [];

  designationDisabled = true;
  streamDisabled = true;
  groupDisabled = true;
  sectionDisabled = true;

  ngOnChanges(): void {
    this.rebuild();
  }

  get isStaff(): boolean {
    return this.value.personType === 'staff';
  }

  private rebuild(): void {
    const o = this.options || EMPTY_FILTER_OPTIONS;
    const v = this.value;
    this.departmentOptions = [{ value: '', label: 'All departments' }, ...o.departments.map((row) => ({ value: row._id, label: row.name }))];
    this.designationOptions = [{ value: '', label: 'All designations' },
      ...o.designations.filter((row) => row.departmentId === v.departmentId).map((row) => ({ value: row._id, label: row.title }))];
    this.designationDisabled = !this.isStaff || !v.departmentId;

    this.classOptions = [{ value: '', label: 'All classes' }, ...o.classes.map((row) => ({ value: row._id, label: row.label }))];
    const chosen: FilterClass | undefined = o.classes.find((row) => row._id === v.classId);
    const stream = chosen?.streams.find((row) => row._id === v.streamId);
    this.streamDisabled = this.isStaff || !chosen?.hasStreams;
    this.streamOptions = [{ value: '', label: 'All streams' }, ...(chosen?.streams || []).map((row) => ({ value: row._id, label: titleCase(row.name) }))];

    // A streamed class needs its stream before groups/sections mean anything.
    const ready = Boolean(chosen) && (!chosen?.hasStreams || Boolean(stream));
    const groups = ready
      ? o.groups.filter((group) => !group.isSystemGroup && group.classId === chosen?._id && (group.streamId || '') === (stream?._id || ''))
      : [];
    this.groupDisabled = this.isStaff || !groups.length;
    this.groupOptions = [{ value: '', label: 'All groups' }, ...groups.map((group) => ({ value: group._id, label: group.name }))];

    const sections = ready ? (chosen?.hasStreams ? stream?.sections || [] : chosen?.sections || []) : [];
    this.sectionDisabled = this.isStaff || !sections.length;
    this.sectionOptions = [{ value: '', label: 'All sections' }, ...sections.map((section) => ({ value: section._id, label: 'Section ' + section.name }))];
  }

  onPersonTypeChange(personType: string): void {
    const next = personType === 'student' ? 'student' : 'staff';
    if (next === this.value.personType) return;
    this.emit({ ...EMPTY_PERSON_FILTER, personType: next });
  }

  onDepartmentChange(departmentId: string): void {
    this.emit({ ...this.value, departmentId, designationId: '' });
  }

  onDesignationChange(designationId: string): void {
    this.emit({ ...this.value, designationId });
  }

  onClassChange(classId: string): void {
    this.emit({ ...this.value, classId, streamId: '', groupId: '', sectionId: '' });
  }

  onStreamChange(streamId: string): void {
    this.emit({ ...this.value, streamId, groupId: '', sectionId: '' });
  }

  onGroupChange(groupId: string): void {
    this.emit({ ...this.value, groupId });
  }

  onSectionChange(sectionId: string): void {
    this.emit({ ...this.value, sectionId });
  }

  private emit(next: PersonFilterValue): void {
    this.value = next;
    this.rebuild();
    this.valueChange.emit(next);
  }
}
