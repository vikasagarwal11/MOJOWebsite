import { Timestamp } from 'firebase/firestore';

export function toMillis(v: any): number {
  if (!v) return 0;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v?.toDate === 'function') return v.toDate().getTime();
  return new Date(v).getTime();
}

export function tsToDate(v: any): Date {
  if (!v) return new Date();
  if (typeof v?.toDate === 'function') return v.toDate();
  if (typeof v?.toMillis === 'function') return new Date(v.toMillis());
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  return new Date(v);
}

export const nowTs = () => Timestamp.fromMillis(Date.now());
