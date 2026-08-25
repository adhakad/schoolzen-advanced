import { Pipe, PipeTransform } from '@angular/core';

/**
 * A class, written the way a clerk says it out loud.
 *
 * Distinct from `classSuffix` ("5th") on two counts that matter on the Leave screens:
 *   1. It says "Class 5", which is what leave-ui-simplify-v2.md asks every class dropdown in
 *      this module to show.
 *   2. It NEVER returns undefined. `classSuffix` falls off the end of its if-chain for
 *      anything outside 1-12 and 200-202 and renders as an empty cell — a class picker with
 *      blank options is unusable, so an unknown value falls back to "Class <value>" rather
 *      than to nothing.
 *
 * 200/201/202 are the stored values for Nursery/LKG/UKG school-wide (see
 * backend/modules/helpers/format-class-name.js, the server-side twin) and must never reach a
 * user as digits.
 */
@Pipe({
  name: 'classLabel'
})
export class ClassLabelPipe implements PipeTransform {

  transform(value: any): string {
    if (value === null || value === undefined || value === '') return '';

    const classNumber = Number(value);
    if (classNumber === 200) return 'Nursery';
    if (classNumber === 201) return 'LKG';
    if (classNumber === 202) return 'UKG';
    if (Number.isFinite(classNumber) && classNumber >= 1 && classNumber <= 12) {
      return `Class ${classNumber}`;
    }
    return `Class ${value}`;
  }

}
