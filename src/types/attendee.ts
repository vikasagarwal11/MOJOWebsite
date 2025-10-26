export type AttendeeStatus = 'going' | 'not-going' | 'waitlisted';
export type AttendeeType = 'primary' | 'family_member' | 'guest';
export type Relationship = 'self' | 'spouse' | 'child' | 'guest';
export type AgeGroup = '0-2' | '3-5' | '6-10' | '11+' | 'adult';

export interface Attendee {
  attendeeId: string;     // doc id (primary identifier)
  id?: string;           // legacy field for backward compatibility
  eventId: string;
  userId: string;         // who RSVP'd this person
  attendeeType: AttendeeType;
  relationship: Relationship;
  name: string;
  ageGroup: AgeGroup;
  rsvpStatus: AttendeeStatus;
  familyMemberId?: string | null;
  // Enhanced waitlist management
  waitlistPosition?: number | null;  // Explicit waitlist position
  waitlistPriority?: number;         // Priority-based position (0.1 for VIP, 0.3 for Premium, etc.)
  waitlistJoinedAt?: any;           // When first joined waitlist (never changes)
  originalWaitlistJoinedAt?: any;   // Original join time (for position calculation)
  promotedAt?: any;                 // When promoted from waitlist
  promotedFromWaitlist?: boolean;   // Flag indicating auto-promotion
  promotionNumber?: number;          // Sequential promotion number
  // Payment information
  paymentStatus?: import('./payment').PaymentStatus;
  paymentTransactionId?: string; // Reference to payment transaction
  price?: number; // Price in cents for this attendee
  createdAt: any;
  updatedAt: any;
}

export interface CreateAttendeeData {
  eventId: string;
  userId: string;
  attendeeType: AttendeeType;
  relationship: Relationship;
  name: string;
  ageGroup: AgeGroup;
  rsvpStatus: AttendeeStatus;
  familyMemberId?: string | null;
}

export interface UpdateAttendeeData {
  name?: string;
  ageGroup?: AgeGroup;
  rsvpStatus?: AttendeeStatus;
  relationship?: Relationship;
  familyMemberId?: string | null;
  // Waitlist position management
  waitlistPosition?: number | null;
  waitlistJoinedAt?: any;
  originalWaitlistJoinedAt?: any;
  promotedAt?: any;
  promotedFromWaitlist?: boolean;
  promotionNumber?: number;
}

export interface AttendeeCounts {
  goingCount: number;
  notGoingCount: number;
  waitlistedCount: number;
  totalGoingByAgeGroup: Record<AgeGroup, number>;
  totalGoing: number;
}

export interface AttendeeValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface BulkAttendeeOperation {
  eventId: string;
  userId: string;
  attendees: CreateAttendeeData[];
  operation: 'create' | 'update' | 'delete';
}




