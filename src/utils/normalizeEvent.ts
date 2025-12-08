/**
 * Centralized event normalization utilities
 * Ensures all Firebase data is properly converted before reaching components
 */

import { RRule, RRuleStrOptions } from 'rrule';
import { safeToDate } from './dateUtils';
import { EventDoc } from '../hooks/useEvents';
import { isFirebaseTimestamp } from './dataSanitizer';

/**
 * Safely convert any input to RRule instance
 * Handles strings, RRule instances, and options objects
 */
export function toRRule(input: unknown): RRule | null {
  if (!input) return null;
  
  try {
    // CRITICAL: Check if input is a Firebase Timestamp FIRST - don't convert to string
    if (isFirebaseTimestamp(input)) {
      console.warn('🔍 RRULE input is a Firebase Timestamp, not a recurrence rule:', input);
      return null;
    }
    
    // CRITICAL: Check if input is a Date object - don't convert to string
    if (input instanceof Date) {
      console.warn('🔍 RRULE input is a Date object, not a recurrence rule:', input);
      return null;
    }
    
    // Handle string input (RRULE string) - ADD EXTRA TYPE CHECK
    if (typeof input === 'string' && input.trim()) {
      try { 
        return RRule.fromString(input); 
      } catch (error) {
        console.warn('Failed to parse RRULE string:', input, error);
        return null;
      }
    }
    
    // CRITICAL: Handle non-string inputs that might cause .split() errors
    if (typeof input !== 'string') {
      console.warn('🔍 RRULE input is not a string, skipping:', typeof input, input?.constructor?.name);
      return null;
    }
    
    // Handle RRule instance
    if (input && typeof input === 'object' && 'toString' in input) {
      return input as RRule;
    }
    
    // Handle options object
    if (typeof input === 'object' && input !== null) {
      try { 
        return new RRule(input as RRuleStrOptions); 
      } catch (error) {
        console.warn('Failed to create RRule from options:', input, error);
        return null;
      }
    }
    
    // Log the problematic input for debugging
    console.warn('Unknown RRULE input type:', typeof input, input);
    console.warn('Input constructor:', input?.constructor?.name);
    console.warn('Input toString:', input?.toString?.());
    return null;
  } catch (error) {
    console.error('Error in toRRule conversion:', input, error);
    console.error('Input type:', typeof input);
    console.error('Input constructor:', input?.constructor?.name);
    return null;
  }
}

/**
 * Ultra-safe RRule creation that prevents all possible errors
 */
export function ultraSafeToRRule(input: unknown): RRule | null {
  if (!input) return null;
  
  try {
    // CRITICAL: Check if input is a Firebase Timestamp FIRST - don't convert to string
    if (isFirebaseTimestamp(input)) {
      console.warn('🔍 RRULE input is a Firebase Timestamp, not a recurrence rule:', input);
      return null;
    }
    
    // CRITICAL: Check if input is a Date object - don't convert to string
    if (input instanceof Date) {
      console.warn('🔍 RRULE input is a Date object, not a recurrence rule:', input);
      return null;
    }
    
    // Only process string inputs
    if (typeof input !== 'string') {
      console.warn('🔍 RRULE input is not a string, skipping:', typeof input, input?.constructor?.name);
      return null;
    }
    
    const stringInput = input.trim();
    
    // Validate string is not empty and looks like an RRULE
    if (!stringInput || stringInput.length < 3) {
      return null;
    }
    
    // Additional safety check - ensure it contains RRULE-like patterns
    if (!stringInput.includes('RRULE') && !stringInput.includes('FREQ') && !stringInput.includes('INTERVAL')) {
      console.warn('🔍 String does not appear to be an RRULE:', stringInput);
      return null;
    }
    
    // Final validation: ensure it's actually a string before calling fromString
    if (typeof stringInput !== 'string') {
      console.error('🔍 CRITICAL: stringInput is not a string after processing:', typeof stringInput, stringInput);
      return null;
    }
    
    try {
      return RRule.fromString(stringInput);
    } catch (error) {
      console.warn('🔍 Failed to parse RRULE string (ultra-safe):', stringInput, error);
      return null;
    }
  } catch (error) {
    console.error('🔍 Error in ultraSafeToRRule conversion:', input, error);
    return null;
  }
}

/**
 * Normalize a raw Firebase event document to safe format
 * Converts all Timestamps to Date objects and handles RRULE parsing
 */
export function normalizeEvent(rawEvent: any): EventDoc {
  if (!rawEvent) {
    throw new Error('normalizeEvent: rawEvent is required');
  }

  // CRITICAL: Add comprehensive data validation to prevent all TypeError issues
  // Only log in development mode
  if (import.meta.env.DEV) {
    console.log('🚨🚨🚨 NORMALIZE EVENT CALLED 🚨🚨🚨', rawEvent.id, {
      hasRecurrence: !!rawEvent.recurrence,
      recurrenceType: typeof rawEvent.recurrence,
      recurrenceValue: rawEvent.recurrence,
      allKeys: Object.keys(rawEvent)
    });
  }

  try {
    const normalized: EventDoc = {
      ...rawEvent,
      // Convert Firebase Timestamps to JavaScript Date objects
      startAt: safeToDate(rawEvent.startAt) ?? null,
      endAt: safeToDate(rawEvent.endAt) ?? null,
      createdAt: safeToDate(rawEvent.createdAt) ?? new Date(),
      updatedAt: safeToDate(rawEvent.updatedAt) ?? new Date(),
      
      // Handle recurrence rules - CRITICAL: Only process if it's a valid string
      recurrence: (() => {
        const recurrenceValue = rawEvent.recurrence || rawEvent.recurrenceRule || null;
        if (typeof recurrenceValue === 'string' && recurrenceValue.trim()) {
          return ultraSafeToRRule(recurrenceValue);
        }
        return null; // Safe fallback for undefined/null/non-string values
      })(),
      
      // Ensure string fields are properly converted
      title: String(rawEvent.title || ''),
      description: String(rawEvent.description || ''),
      location: String(rawEvent.location || ''),
      visibility: String(rawEvent.visibility || 'public'),
      
      // CRITICAL: Handle missing fields that might cause .split() errors
      tags: Array.isArray(rawEvent.tags) ? rawEvent.tags : [],
      
      // Ensure numeric fields
      maxAttendees: Number(rawEvent.maxAttendees) || undefined,
      duration: Number(rawEvent.duration) || undefined,
      
      // Ensure boolean fields
      allDay: Boolean(rawEvent.allDay),
      isTeaser: Boolean(rawEvent.isTeaser),
      
      // Ensure array fields
      invitedUsers: Array.isArray(rawEvent.invitedUsers) ? rawEvent.invitedUsers : [],
      invitedUserIds: Array.isArray(rawEvent.invitedUserIds) ? rawEvent.invitedUserIds : [],
      
      // Additional safe string fields that might be split in UI
      audience: String(rawEvent.audience || ''),
      ageGroup: String(rawEvent.ageGroup || ''),
    };

    // Only log in development mode
    if (import.meta.env.DEV) {
      console.log('✅ normalizeEvent: Successfully normalized event:', rawEvent.id);
    }
    return normalized as EventDoc;
  } catch (error) {
    console.error('❌ normalizeEvent: Error normalizing event:', rawEvent.id, error);
    console.error('❌ Raw event data:', rawEvent);
    
    // Return a safe fallback event that won't cause TypeError
    return {
      id: rawEvent.id || 'unknown',
      title: 'Invalid Event',
      description: 'This event could not be loaded properly.',
      startAt: new Date(),
      endAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      visibility: 'public',
      allDay: false,
      isTeaser: false,
      invitedUsers: [],
      invitedUserIds: [],
      tags: [],
      recurrence: null,
      maxAttendees: undefined,
      duration: undefined,
    } as EventDoc;
  }
}

/**
 * Normalize an array of events
 */
export function normalizeEvents(rawEvents: any[]): EventDoc[] {
  if (!Array.isArray(rawEvents)) {
    console.warn('normalizeEvents: input is not an array:', rawEvents);
    return [];
  }

  return rawEvents.map(event => normalizeEvent(event));
}

/**
 * Type guard to check if an object is a Firebase Timestamp
 */
export function isFirebaseTimestamp(value: any): boolean {
  return value && 
         typeof value === 'object' && 
         (typeof value.toDate === 'function' || 
          typeof value.toMillis === 'function' ||
          (typeof value.seconds === 'number' && typeof value.nanoseconds === 'number'));
}
