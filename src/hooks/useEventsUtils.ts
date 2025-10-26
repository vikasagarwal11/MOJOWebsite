import { Timestamp } from 'firebase/firestore';

export function toMillis(v: any): number {
  if (!v) return 0;
  
  try {
    // Handle Firestore Timestamp with toMillis method
    if (typeof v?.toMillis === 'function') {
      return v.toMillis();
    }
    
    // Handle Firestore Timestamp with toDate method
    if (typeof v?.toDate === 'function') {
      return v.toDate().getTime();
    }
    
    // Handle Firestore Timestamp with seconds property
    if (v.seconds && typeof v.seconds === 'number') {
      return v.seconds * 1000 + (v.nanoseconds || 0) / 1000000;
    }
    
    // Handle JavaScript Date
    if (v instanceof Date) {
      return v.getTime();
    }
    
    // Handle timestamp number (milliseconds)
    if (typeof v === 'number') {
      return v;
    }
    
    // Handle timestamp string
    if (typeof v === 'string') {
      const date = new Date(v);
      if (isNaN(date.getTime())) {
        console.warn('Invalid timestamp string:', v);
        return 0;
      }
      return date.getTime();
    }
    
    console.warn('Unknown timestamp format:', v);
    return 0;
  } catch (error) {
    console.error('Error converting timestamp to milliseconds:', v, error);
    return 0;
  }
}

export function tsToDate(v: any): Date {
  if (!v) return new Date();
  
  try {
    // Handle Firestore Timestamp with toDate method
    if (typeof v?.toDate === 'function') {
      return v.toDate();
    }
    
    // Handle Firestore Timestamp with toMillis method
    if (typeof v?.toMillis === 'function') {
      return new Date(v.toMillis());
    }
    
    // Handle Firestore Timestamp with seconds property
    if (v.seconds && typeof v.seconds === 'number') {
      return new Date(v.seconds * 1000 + (v.nanoseconds || 0) / 1000000);
    }
    
    // Handle JavaScript Date
    if (v instanceof Date) {
      return v;
    }
    
    // Handle timestamp number (milliseconds)
    if (typeof v === 'number') {
      return new Date(v);
    }
    
    // Handle timestamp string
    if (typeof v === 'string') {
      const date = new Date(v);
      if (isNaN(date.getTime())) {
        console.warn('Invalid date string:', v);
        return new Date();
      }
      return date;
    }
    
    console.warn('Unknown date format:', v);
    return new Date();
  } catch (error) {
    console.error('Error converting to date:', v, error);
    return new Date();
  }
}

export const nowTs = () => Timestamp.fromMillis(Date.now());
