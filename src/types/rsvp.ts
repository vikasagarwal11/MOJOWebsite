// Legacy RSVP types - kept for backward compatibility
// Note: New attendee system uses AttendeeStatus from types/attendee.ts
export type RSVPStatus = 'going' | 'not-going';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export interface RSVPDoc {
  id: string;
  eventId: string;
  userId: string;
  displayName: string | null;
  email: string | null;
  status: RSVPStatus;
  adults: number;
  childCounts: Array<{ ageGroup: string; count: number }> | null;
  guests: Array<{ name: string; phone: string; email: string; ageGroup: string }> | null;
  notes: string | null;
  createdAt: any; // Firestore Timestamp
  updatedAt: any; // Firestore Timestamp
  statusHistory: Array<{
    status: RSVPStatus;
    changedAt: Date; // Changed from 'any' to 'Date' since we're using new Date()
    changedBy: string;
  }>;
}

export interface EventCapacity {
  maxAttendees?: number;
  currentAttendees: number;
  isFull: boolean;
  hasWaitlist: boolean;
  waitlistCount: number;
}

