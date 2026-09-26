/**
 * app-class-cascade-filter — the Class → Stream → Group → Section row of `.dd` pills.
 *
 * Built once and used by all three Student pages (and by any later page that filters by
 * class: Fees, Examination, Certificates). It renders ONLY the four pills — each page keeps
 * its own toolbar markup around it (design-system.md: match each page's own toolbar), and
 * the host is `display: contents` so the pills are direct flex children of the page's
 * `.toolbar-row2`.
 *
 * Dependency rules, from the references:
 *   - Stream exists only for a class that has streams (11th/12th); otherwise it stays
 *     disabled — greyed, never hidden, so the row keeps its shape.
 *   - Group depends on Class (+Stream): a streamed class needs its stream picked first.
 *   - Section depends on Class (+Stream) the same way.
 *   - Changing a parent resets every child to "All", and a disabled pill always shows its
 *     default label (design-system.md, `.dd` disabled state).
 *
 * Emits the whole value on every change, never a partial patch.
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, HostBinding, Input, OnChanges, Output
} from '@angular/core';
import { DdOption } from 'src/app/shared/models/shared-components.model';
import {
  CascadeFilterValue, EMPTY_CASCADE, FilterClass, FilterGroup, FilterSection, StudentFilterOptions
} from 'src/app/shared/models/student/student.model';

const titleCase = (text: string): string => (text || '').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * True when the value names a complete class(+stream) scope: a class is picked, and if
 * that class has streams, a stream too. This is exactly Manage Students' Excel gate.
 */
export const isClassScopeComplete = (
  options: StudentFilterOptions | null,
  value: CascadeFilterValue
): boolean => {
  if (!options || !value.classId) return false;
  const chosen = options.classes.find((item) => item._id === value.classId);
  if (!chosen) return false;
  return !chosen.hasStreams || Boolean(value.streamId);
};

/** "8th" / "11th · Science" — the scope label the Excel modal states. */
export const describeClassScope = (options: StudentFilterOptions | null, value: CascadeFilterValue): string => {
  const chosen = options?.classes.find((item) => item._id === value.classId);
  if (!chosen) return '';
  const stream = chosen.streams.find((item) => item._id === value.streamId);
  return stream ? `${chosen.label} · ${titleCase(stream.name)}` : chosen.label;
};

@Component({
  selector: 'app-class-cascade-filter',
  templateUrl: './class-cascade-filter.component.html',
  styleUrls: ['./class-cascade-filter.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClassCascadeFilterComponent implements OnChanges {
  @Input() options: StudentFilterOptions | null = null;
  @Input() value: CascadeFilterValue = EMPTY_CASCADE;
  /** Class Promotion works on one class at a time: no "All classes" row. */
  @Input() requireClass = false;

  @Output() valueChange = new EventEmitter<CascadeFilterValue>();

  @HostBinding('style.display') readonly display = 'contents';

  classOptions: DdOption[] = [];
  streamOptions: DdOption[] = [];
  groupOptions: DdOption[] = [];
  sectionOptions: DdOption[] = [];

  streamDisabled = true;
  groupDisabled = true;
  sectionDisabled = true;

  /** Classes by id — O(1) per lookup rather than a scan per change. */
  private classById = new Map<string, FilterClass>();

  ngOnChanges(): void {
    this.classById = new Map((this.options?.classes || []).map((item) => [item._id, item]));
    this.rebuild();
  }

  private rebuild(): void {
    const classes = this.options?.classes || [];
    const all: DdOption[] = this.requireClass ? [] : [{ value: '', label: 'All classes' }];
    this.classOptions = all.concat(classes.map((item) => ({ value: item._id, label: item.label })));

    const chosen = this.classById.get(this.value.classId) || null;
    const stream = chosen?.streams.find((item) => item._id === this.value.streamId) || null;

    this.streamDisabled = !chosen || !chosen.hasStreams;
    this.streamOptions = [{ value: '', label: 'All streams' }].concat(
      (chosen?.streams || []).map((item) => ({ value: item._id, label: titleCase(item.name) }))
    );

    // Placement is "ready" once a class is picked and, for a streamed class, its stream.
    const placementReady = Boolean(chosen) && (!chosen?.hasStreams || Boolean(stream));

    const groups: FilterGroup[] = placementReady
      ? (this.options?.groups || []).filter((group) =>
          group.classId === chosen?._id && (group.streamId || '') === (stream?._id || ''))
      : [];
    this.groupDisabled = groups.length === 0;
    this.groupOptions = [{ value: '', label: 'All groups' }].concat(
      groups.map((group) => ({ value: group._id, label: group.name }))
    );

    const sections: FilterSection[] = placementReady
      ? (chosen?.hasStreams ? stream?.sections || [] : chosen?.sections || [])
      : [];
    this.sectionDisabled = sections.length === 0;
    this.sectionOptions = [{ value: '', label: 'All sections' }].concat(
      sections.map((section) => ({ value: section._id, label: 'Section ' + section.name }))
    );
  }

  onClassChange(classId: string): void {
    this.emit({ classId, streamId: '', groupId: '', sectionId: '' });
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

  private emit(next: CascadeFilterValue): void {
    this.value = next;
    this.rebuild();
    this.valueChange.emit(next);
  }
}
