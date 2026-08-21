import { Pipe, PipeTransform } from '@angular/core';

/**
 * "HH:mm" (24-hour wall clock) -> "h:mm AM/PM".
 *
 * Everything attendance-side stores and moves time as a 24-hour "HH:mm" string — the Shift
 * model, the roster tooltips, the punch times the calendar renders. That is the right
 * storage format and the wrong reading format for a school office, so the conversion lives
 * here at the render boundary and nowhere else.
 *
 * ANYTHING UNPARSEABLE PASSES THROUGH UNCHANGED. That is deliberate and load-bearing:
 * attendance.component.ts's timeLabel() returns an en-dash for a missing punch, and a pipe
 * that turned that into "Invalid" or "" would make an empty cell look like a broken one.
 *
 * Exported as a plain function as well as a pipe, because the same formatting is needed
 * from TypeScript — tooltip strings are assembled in the component, where a pipe cannot
 * reach. One implementation, two call styles, so the two can never drift apart.
 *
 * @param value "HH:mm" or "H:mm", optionally with seconds ("09:00:30" -> "9:00 AM")
 */
export const toAmPm = (value: string | null | undefined): string => {
  if (value === null || value === undefined) return '';

  const raw = String(value).trim();
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw);
  if (!match) return raw;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return raw;

  // 00:xx is 12 AM and 12:xx is 12 PM — the two cases a plain `% 12` gets wrong.
  const period = hours < 12 ? 'AM' : 'PM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;

  return `${displayHours}:${match[2]} ${period}`;
};

@Pipe({
  name: 'timeAmPm'
})
export class TimeAmPmPipe implements PipeTransform {

  transform(value: string | null | undefined): string {
    return toAmPm(value);
  }

}
