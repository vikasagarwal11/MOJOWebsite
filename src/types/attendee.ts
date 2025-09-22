export type AttendeeStatus = 'going' | 'not-going' | 'pending' | 'waitlisted';
export type AttendeeType = 'primary' | 'family_member' | 'guest';
export type Relationship = 'self' | 'spouse' | 'child' | 'guest';
export type AgeGroup = '0-2' | '3-5' | '6-10' | '11+' | 'adult';

export interface Attendee {
  attendeeId: string;     // doc id
  eventId: string;
  userId: string;         // who RSVP'd this person
  attendeeType: AttendeeType;
  relationship: Relationship;
  name: string;
  ageGroup: AgeGroup;
  rsvpStatus: AttendeeStatus;
  familyMemberId?: string | null;
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
}

export interface AttendeeCounts {
  goingCount: number;
  notGoingCount: number;
  pendingCount: number;
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
