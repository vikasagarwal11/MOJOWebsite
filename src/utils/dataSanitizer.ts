import { Timestamp } from 'firebase/firestore';

/**
 * Comprehensive data sanitization utility to prevent Firebase Timestamp errors
 * This ensures all data is properly converted before being passed to functions that expect strings
 */

export function sanitizeFirebaseData(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  // Handle functions - convert to null to prevent "n is not a function" errors
  if (typeof data === 'function') {
    console.warn('🔍 Function found in data, converting to null:', data.name || 'anonymous');
    return null;
  }

  // Handle circular references and complex objects
  if (typeof data === 'object') {
    // Check for circular references
    const seen = new WeakSet();
    
    function sanitizeObject(obj: any, depth = 0): any {
      if (depth > 10) { // Prevent infinite recursion
        console.warn('🔍 Object depth limit reached, returning null');
        return null;
      }
      
      if (obj === null || obj === undefined) {
        return obj;
      }
      
      if (typeof obj === 'function') {
        console.warn('🔍 Function found in nested object, converting to null');
        return null;
      }
      
      if (seen.has(obj)) {
        console.warn('🔍 Circular reference detected, returning null');
        return null;
      }
      
      if (Array.isArray(obj)) {
        seen.add(obj);
        const sanitized = obj.map(item => sanitizeObject(item, depth + 1));
        seen.delete(obj);
        return sanitized;
      }
      
      if (typeof obj === 'object') {
        seen.add(obj);
        const sanitized: any = {};
        
        try {
          for (const [key, value] of Object.entries(obj)) {
            // Ensure keys are strings
            const safeKey = typeof key === 'string' ? key : String(key);
            
            // Handle Firebase Timestamps
            if (isFirebaseTimestamp(value)) {
              sanitized[safeKey] = convertTimestampToDate(value);
            } else if (safeKey === 'recurrence' || safeKey === 'recurrenceRule') {
              // CRITICAL: Handle recurrence fields that might cause .split() errors
              if (typeof value === 'string' && value.trim()) {
                sanitized[safeKey] = value.trim();
              } else {
                console.warn('🔍 Invalid recurrence field, setting to null:', { key: safeKey, value, type: typeof value });
                sanitized[safeKey] = null;
              }
            } else if (typeof value === 'function') {
              // Convert functions to null to prevent errors
              console.warn('🔍 Function found in object property, converting to null:', safeKey);
              sanitized[safeKey] = null;
            } else if (typeof value === 'object' && value !== null) {
              sanitized[safeKey] = sanitizeObject(value, depth + 1);
            } else {
              sanitized[safeKey] = value;
            }
          }
        } catch (error) {
          console.warn('🔍 Error sanitizing object:', error);
          return null;
        }
        
        seen.delete(obj);
        return sanitized;
      }
      
      return obj;
    }
    
    return sanitizeObject(data);
  }

  return data;
}

export function isFirebaseTimestamp(value: any): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  // Check for Firebase Timestamp properties
  return (
    (value.seconds !== undefined && typeof value.seconds === 'number') ||
    (value.toDate && typeof value.toDate === 'function') ||
    (value.toMillis && typeof value.toMillis === 'function') ||
    (value._seconds !== undefined && typeof value._seconds === 'number') ||
    (value._nanoseconds !== undefined && typeof value._nanoseconds === 'number')
  );
}

export function convertTimestampToDate(timestamp: any): Date {
  if (!timestamp) {
    return new Date();
  }

  try {
    // Handle Firebase Timestamp with toDate method
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    
    // Handle Firebase Timestamp with toMillis method
    if (timestamp.toMillis && typeof timestamp.toMillis === 'function') {
      return new Date(timestamp.toMillis());
    }
    
    // Handle Firebase Timestamp with seconds property
    if (timestamp.seconds !== undefined && typeof timestamp.seconds === 'number') {
      return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
    }
    
    // Handle Firebase Timestamp with _seconds property (internal format)
    if (timestamp._seconds !== undefined && typeof timestamp._seconds === 'number') {
      return new Date(timestamp._seconds * 1000 + (timestamp._nanoseconds || 0) / 1000000);
    }
    
    // Handle JavaScript Date
    if (timestamp instanceof Date) {
      return timestamp;
    }
    
    // Handle timestamp number (milliseconds)
    if (typeof timestamp === 'number') {
      return new Date(timestamp);
    }
    
    // Handle timestamp string
    if (typeof timestamp === 'string') {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        console.warn('Invalid timestamp string:', timestamp);
        return new Date();
      }
      return date;
    }
    
    console.warn('Unknown timestamp format:', timestamp);
    return new Date();
  } catch (error) {
    console.error('Error converting timestamp to date:', timestamp, error);
    return new Date();
  }
}

export function safeStringConversion(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  if (typeof value === 'boolean') {
    return value.toString();
  }

  if (isFirebaseTimestamp(value)) {
    return convertTimestampToDate(value).toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (error) {
      console.warn('Could not stringify object:', value);
      return '[Object]';
    }
  }

  return String(value);
}

export function safeArrayConversion(value: any): any[] {
  if (Array.isArray(value)) {
    return value.map(item => sanitizeFirebaseData(item));
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [sanitizeFirebaseData(value)];
}

export function safeObjectConversion(value: any): Record<string, any> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return sanitizeFirebaseData(value);
  }

  if (value === null || value === undefined) {
    return {};
  }

  return { value: sanitizeFirebaseData(value) };
}
