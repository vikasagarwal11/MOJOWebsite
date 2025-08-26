
import { RRule, rrulestr } from 'rrule';
import { tsToDate } from './firestore';

export type Recurrence = {
  rrule: string; // RFC 5545 RRULE string
  timezone?: string;
  exdates?: string[]; // ISO strings
};

/** Expand RRULE into concrete Date ranges intersecting [rangeStart, rangeEnd] */
export const expandRecurrence = (
  start: Date,
  end: Date,
  recurrence: Recurrence | undefined,
  rangeStart: Date,
  rangeEnd: Date
): { start: Date; end: Date }[] => {
  if (!recurrence?.rrule) return [{ start, end }];
  const rule = rrulestr(recurrence.rrule);
  const between = rule.between(rangeStart, rangeEnd, true);

  const ex = new Set((recurrence.exdates || []).map(s => new Date(s).toDateString()));
  return between
    .filter(dt => !ex.has(dt.toDateString()))
    .map(dt => {
      const duration = end.getTime() - start.getTime();
      return { start: dt, end: new Date(dt.getTime() + duration) };
    });
};
