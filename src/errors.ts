/**
 * Custom error classes for RSVP and capacity management
 * Provides structured error handling with context-specific information
 */

export class CapacityError extends Error {
  constructor(
    message: string,
    public eventId: string,
    public currentCount: number,
    public maxAttendees: number,
    public waitlistEnabled: boolean,
    public canWaitlist: boolean,
    public reason?: 'capacity_exceeded' | 'waitlist_disabled' | 'waitlist_full'
  ) {
    super(message);
    this.name = 'CapacityError';
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CapacityError);
    }
  }

  /**
   * Get user-friendly error message based on error context
   */
  getUserMessage(): string {
    if (this.canWaitlist) {
      return 'Event is full. You have been added to the waitlist.';
    }
    
    const detail = this.maxAttendees 
      ? ` (${this.currentCount}/${this.maxAttendees})` 
      : '';
    
    return `Event is full${detail}. No more RSVPs can be accepted.`;
  }
}

export class PermissionError extends Error {
  constructor(
    message: string,
    public reason: 'ownership' | 'blocked' | 'unknown'
  ) {
    super(message);
    this.name = 'PermissionError';
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PermissionError);
    }
  }

  /**
   * Get user-friendly error message based on error reason
   */
  getUserMessage(): string {
    switch (this.reason) {
      case 'ownership':
        return 'You can only update your own RSVP.';
      case 'blocked':
        return 'You are blocked from updating this RSVP.';
      case 'unknown':
      default:
        return 'You do not have permission to perform this action.';
    }
  }
}


