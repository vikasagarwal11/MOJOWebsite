
import { Timestamp, serverTimestamp } from 'firebase/firestore';

export const tsToDate = (v: any): Date => {
  if (!v) return new Date();
  if (typeof v?.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'string') return new Date(v);
  if (typeof v === 'number') return new Date(v);
  return new Date();
};

export const toTimestamp = (v: any): Timestamp => {
  const d = tsToDate(v);
  return Timestamp.fromDate(d);
};

/** Remove undefined, convert empty strings to null for optional fields */
export const cleanForFirestore = <T extends Record<string, any>>(obj: T): T => {
  const out: Record<string, any> = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined) return;
    if (v === '') { out[k] = null; return; }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = cleanForFirestore(v);
    } else {
      out[k] = v;
    }
  });
  return out as T;
};

export const withTimestamps = <T extends Record<string, any>>(obj: T, isCreate = true): T => {
  return {
    ...(obj as any),
    ...(isCreate ? { createdAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
  };
};
