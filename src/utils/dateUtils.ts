import { format, parseISO, isValid, formatDistanceToNow, formatDistance, differenceInDays, differenceInHours, differenceInMinutes } from 'date-fns';
import { Timestamp } from 'firebase/firestore';

/**
 * Enhanced date utilities that safely handle Firebase Timestamps
 * This prevents the "r.split is not a function" and "e is not a function" errors
 */

export function safeToDate(value: any): Date | null {
  if (!value) return null;
  
  try {
    // Handle Firebase Timestamp with toDate method
    if (value.toDate && typeof value.toDate === 'function') {
      return value.toDate();
    }
    
    // Handle Firebase Timestamp with toMillis method
    if (value.toMillis && typeof value.toMillis === 'function') {
      return new Date(value.toMillis());
    }
    
    // Handle Firebase Timestamp with seconds property
    if (value.seconds !== undefined && typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000 + (value.nanoseconds || 0) / 1000000);
    }
    
    // Handle Firebase Timestamp with _seconds property (internal format)
    if (value._seconds !== undefined && typeof value._seconds === 'number') {
      return new Date(value._seconds * 1000 + (value._nanoseconds || 0) / 1000000);
    }
    
    // Handle JavaScript Date
    if (value instanceof Date) {
      return value;
    }
    
    // Handle timestamp number (milliseconds)
    if (typeof value === 'number') {
      return new Date(value);
    }
    
    // Handle timestamp string
    if (typeof value === 'string') {
      // Try parseISO first for ISO strings
      try {
        const parsed = parseISO(value);
        if (isValid(parsed)) {
          return parsed;
        }
      } catch (e) {
        // Fall back to regular Date constructor
      }
      
      const date = new Date(value);
      if (isValid(date)) {
        return date;
      }
      
      console.warn('Invalid date string:', value);
      return null;
    }
    
    console.warn('Unknown date format:', value);
    return null;
  } catch (error) {
    console.error('Error converting to date:', value, error);
    return null;
  }
}

export function safeFormat(value: any, formatStr: string, fallback: string = 'Invalid Date'): string {
  const date = safeToDate(value);
  if (!date) return fallback;
  
  try {
    return format(date, formatStr);
  } catch (error) {
    console.error('Error formatting date:', value, error);
    return fallback;
  }
}

export function safeFormatDistanceToNow(value: any, fallback: string = 'Unknown time'): string {
  const date = safeToDate(value);
  if (!date) return fallback;
  
  try {
    return formatDistanceToNow(date, { addSuffix: true });
  } catch (error) {
    console.error('Error formatting distance to now:', value, error);
    return fallback;
  }
}

export function safeFormatDistance(from: any, to: any, fallback: string = 'Unknown duration'): string {
  const fromDate = safeToDate(from);
  const toDate = safeToDate(to);
  
  if (!fromDate || !toDate) return fallback;
  
  try {
    return formatDistance(fromDate, toDate);
  } catch (error) {
    console.error('Error formatting distance:', from, to, error);
    return fallback;
  }
}

export function safeDifferenceInDays(from: any, to: any): number {
  const fromDate = safeToDate(from);
  const toDate = safeToDate(to);
  
  if (!fromDate || !toDate) return 0;
  
  try {
    return differenceInDays(fromDate, toDate);
  } catch (error) {
    console.error('Error calculating difference in days:', from, to, error);
    return 0;
  }
}

export function safeDifferenceInHours(from: any, to: any): number {
  const fromDate = safeToDate(from);
  const toDate = safeToDate(to);
  
  if (!fromDate || !toDate) return 0;
  
  try {
    return differenceInHours(fromDate, toDate);
  } catch (error) {
    console.error('Error calculating difference in hours:', from, to, error);
    return 0;
  }
}

export function safeDifferenceInMinutes(from: any, to: any): number {
  const fromDate = safeToDate(from);
  const toDate = safeToDate(to);
  
  if (!fromDate || !toDate) return 0;
  
  try {
    return differenceInMinutes(fromDate, toDate);
  } catch (error) {
    console.error('Error calculating difference in minutes:', from, to, error);
    return 0;
  }
}

export function safeIsValid(value: any): boolean {
  const date = safeToDate(value);
  return date !== null && isValid(date);
}

export function safeToISOString(value: any): string {
  const date = safeToDate(value);
  if (!date) return '';
  
  try {
    return date.toISOString();
  } catch (error) {
    console.error('Error converting to ISO string:', value, error);
    return '';
  }
}

/**
 * Safely converts any date value to YYYY-MM-DD format (ISO date part only)
 * This replaces the unsafe pattern: value.toISOString().split('T')[0]
 */
export function safeISODate(value: any): string {
  const date = safeToDate(value);
  if (!date) return '';
  
  try {
    // Use slice instead of split to avoid the "split is not a function" error
    return date.toISOString().slice(0, 10); // YYYY-MM-DD
  } catch (error) {
    console.error('Error converting to ISO date:', value, error);
    return '';
  }
}

export function safeToLocaleDateString(value: any, fallback: string = 'Invalid Date'): string {
  const date = safeToDate(value);
  if (!date) return fallback;
  
  try {
    return date.toLocaleDateString();
  } catch (error) {
    console.error('Error converting to locale date string:', value, error);
    return fallback;
  }
}

export function safeToLocaleTimeString(value: any, fallback: string = 'Invalid Time'): string {
  const date = safeToDate(value);
  if (!date) return fallback;
  
  try {
    return date.toLocaleTimeString();
  } catch (error) {
    console.error('Error converting to locale time string:', value, error);
    return fallback;
  }
}

export function safeGetTime(value: any): number {
  const date = safeToDate(value);
  if (!date) return 0;
  
  try {
    return date.getTime();
  } catch (error) {
    console.error('Error getting time:', value, error);
    return 0;
  }
}

// Helper to create a Firebase Timestamp from a Date
export function dateToFirebaseTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}

// Helper to create a Firebase Timestamp from milliseconds
export function millisToFirebaseTimestamp(millis: number): Timestamp {
  return Timestamp.fromMillis(millis);
}

// Helper to get current Firebase Timestamp
export function nowFirebaseTimestamp(): Timestamp {
  return Timestamp.now();
}
