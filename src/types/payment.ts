import { Timestamp } from 'firebase/firestore';

// Payment status types
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded' | 'failed' | 'pending';
export type PaymentMethod = 'card' | 'bank_transfer' | 'cash' | 'paypal' | 'venmo' | 'zelle' | 'other';
export type RefundStatus = 'none' | 'partial' | 'full' | 'requested';

// Age group pricing configuration
export interface AgeGroupPricing {
  ageGroup: '0-2' | '3-5' | '6-10' | '11+' | 'adult';
  price: number; // NET price in cents (what admin receives after Stripe fees)
  chargePrice?: number; // CHARGE price in cents (what user pays, includes Stripe fees)
  label: string; // Display label like "Adults", "Children (3-5)", etc.
}

// Event pricing configuration
export interface EventPricing {
  isFree: boolean;
  requiresPayment: boolean;
  payThere?: boolean; // Payment handled at event or with organization
  adultPrice: number; // NET price in cents for adults (what admin receives after Stripe fees)
  adultChargePrice?: number; // CHARGE price in cents for adults (what user pays, includes Stripe fees)
  ageGroupPricing: AgeGroupPricing[];
  currency: string; // ISO currency code (e.g., 'USD')
  paymentDeadline?: Timestamp; // Optional deadline for payments
  refundPolicy?: {
    allowed: boolean;
    deadline?: Timestamp; // Refund deadline
    feePercentage?: number; // Refund fee percentage (0-100)
  };
  eventSupportAmount?: number; // Additional event support fee in cents (NET amount, optional)
  eventSupportChargeAmount?: number; // CHARGE amount for event support (what user pays, includes Stripe fees)
}

// Payment transaction record
export interface PaymentTransaction {
  id: string;
  eventId: string;
  userId: string;
  attendeeId: string; // Reference to the attendee record
  amount: number; // Amount in cents
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod;
  stripePaymentIntentId?: string; // Stripe payment intent ID
  stripeChargeId?: string; // Stripe charge ID
  refundStatus: RefundStatus;
  refundedAmount?: number; // Amount refunded in cents
  refundReason?: string;
  metadata: {
    attendeeName: string;
    ageGroup: string;
    eventTitle: string;
    eventDate: string;
    totalAttendees: number;
    breakdown: {
      attendeeId: string;
      attendeeName: string;
      ageGroup: string;
      price: number;
      quantity: number;
      subtotal: number;
    }[];
    paidAttendees: {
      attendeeId: string;
      name: string;
      ageGroup: string;
      amount: number;
    }[];
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  paidAt?: Timestamp;
  refundedAt?: Timestamp;
}

// Payment summary for RSVP
export interface PaymentSummary {
  totalAmount: number; // Total amount in cents
  currency: string;
  breakdown: {
    attendeeId: string;
    attendeeName: string;
    ageGroup: string;
    price: number;
    quantity: number;
    subtotal: number;
    ticketPrice?: number; // Ticket charge amount (with proportional Stripe fee)
    eventSupport?: number; // Event support charge amount (with proportional Stripe fee)
  }[];
  status: PaymentStatus;
  canRefund: boolean;
  refundDeadline?: Timestamp;
}

// Stripe webhook event data
export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: any; // Stripe event object
  };
  created: number;
}

// Payment configuration for admin
export interface PaymentConfig {
  stripePublishableKey: string;
  stripeSecretKey: string; // Server-side only
  webhookSecret: string;
  defaultCurrency: string;
  enabled: boolean;
}

// Refund request
export interface RefundRequest {
  id: string;
  paymentId: string;
  eventId: string;
  userId: string;
  requestedAmount: number; // Amount to refund in cents
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'processed';
  adminNotes?: string;
  requestedAt: Timestamp;
  processedAt?: Timestamp;
  processedBy?: string;
}

// Payment analytics
export interface PaymentAnalytics {
  eventId: string;
  totalRevenue: number; // Total revenue in cents
  totalTransactions: number;
  paidTransactions: number;
  refundedTransactions: number;
  averageTransactionValue: number;
  paymentMethodBreakdown: {
    method: PaymentMethod;
    count: number;
    totalAmount: number;
  }[];
  ageGroupBreakdown: {
    ageGroup: string;
    count: number;
    totalAmount: number;
  }[];
  lastUpdated: Timestamp;
}
