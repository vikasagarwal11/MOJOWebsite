export type RSVPStatus = 'going' | 'not-going';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export interface RSVPDoc {
  id?: string;
  eventId: string;
  userId: string;
  displayName?: string | null;
  email?: string | null;
  status: RSVPStatus;
  adults: number;
  kids: number;
  notes?: string;
  requiresPayment?: boolean;
  paymentStatus?: PaymentStatus;
  createdAt?: any;
  updatedAt?: any;
  statusHistory?: Array<{
    status: RSVPStatus;
    changedAt: Date;
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
