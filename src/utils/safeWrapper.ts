/**
 * Safe wrapper utilities to prevent crashes from malformed data
 */

/**
 * Safely execute a function and return fallback on error
 */
export function safe<T>(fn: () => T, fallback: T): T {
  try { 
    return fn(); 
  } catch (e) { 
    console.error('safe() caught error:', e);
    return fallback; 
  }
}

/**
 * Safely execute an async function and return fallback on error
 */
export async function safeAsync<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { 
    return await fn(); 
  } catch (e) { 
    console.error('safeAsync() caught error:', e);
    return fallback; 
  }
}

/**
 * Ensure a value is a string before calling .split()
 */
export function ensureString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

/**
 * Safely split a string with fallback
 */
export function safeSplit(value: unknown, separator: string = ','): string[] {
  const str = ensureString(value);
  return str.split(separator).map(s => s.trim()).filter(Boolean);
}

/**
 * Safely call a function if it exists
 */
export function safeCall<T extends (...args: any[]) => any>(
  fn: T | undefined | null, 
  ...args: Parameters<T>
): ReturnType<T> | undefined {
  if (typeof fn === 'function') {
    try {
      return fn(...args);
    } catch (e) {
      console.error('safeCall() caught error:', e);
      return undefined;
    }
  }
  return undefined;
}

/**
 * Safely handle array vs string for tags/categories
 */
export function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  if (typeof value === 'string') {
    return safeSplit(value);
  }
  return [];
}

/**
 * Ultra-safe RRule parsing that prevents all possible errors
 */
export function ultraSafeRRuleParse(value: unknown): any {
  try {
    if (typeof value === 'string' && value.trim()) {
      // Only process if it looks like a valid RRULE
      if (value.includes('FREQ=') || value.includes('INTERVAL=')) {
        return value.trim();
      }
    }
    return null;
  } catch (error) {
    console.warn('🔍 ultraSafeRRuleParse caught error:', error);
    return null;
  }
}

/**
 * Safe array operations that prevent "e is not a function" errors
 */
export function safeArrayMap<T, U>(
  array: unknown,
  mapper: (item: T, index: number) => U,
  fallback: U[] = []
): U[] {
  try {
    if (!Array.isArray(array)) {
      return fallback;
    }
    return array.map(mapper);
  } catch (error) {
    console.warn('🔍 safeArrayMap caught error:', error);
    return fallback;
  }
}

/**
 * Safe array forEach that prevents "e is not a function" errors
 */
export function safeArrayForEach<T>(
  array: unknown,
  callback: (item: T, index: number) => void
): void {
  try {
    if (!Array.isArray(array)) {
      return;
    }
    array.forEach(callback);
  } catch (error) {
    console.warn('🔍 safeArrayForEach caught error:', error);
  }
}
