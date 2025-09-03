/**
 * Utility functions for RSVP Modal
 * Pure utility functions with no side effects
 */

/**
 * Generate a unique ID with crypto fallback
 */
export const makeId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

/**
 * Join class names with proper spacing
 * Similar to clsx but lightweight
 */
export const cn = (...classes: (string | undefined | null | false)[]): string => {
  return classes.filter(Boolean).join(' ');
};

/**
 * Truncate address for mobile display
 */
export const truncateAddress = (address: string, maxChars: number = 50): string => {
  if (address.length <= maxChars) return address;
  return address.substring(0, maxChars - 3) + '...';
};

/**
 * Format attendee count with proper pluralization
 */
export const formatAttendeeCount = (count: number, label: string = 'attendee'): string => {
  return `${count} ${label}${count !== 1 ? 's' : ''}`;
};

/**
 * Format capacity percentage
 */
export const formatCapacityPercentage = (current: number, max: number): string => {
  const percentage = Math.round((current / max) * 100);
  return `${percentage}%`;
};

/**
 * Check if a value is empty (null, undefined, or empty string)
 */
export const isEmpty = (value: any): boolean => {
  return value == null || value === '';
};

/**
 * Safely get nested object property
 */
export const getNestedProperty = (obj: any, path: string, defaultValue: any = undefined): any => {
  return path.split('.').reduce((current, key) => current?.[key], obj) ?? defaultValue;
};
