import { Timestamp } from 'firebase-admin/firestore';
import { GuestContactInfo } from './guestSession';

/**
 * Payment status types
 * Extended to include 'pending' for Zelle payments awaiting admin verification
 */
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded' | 'failed' | 'pending' | 'waiting_for_approval' | 'rejected';

/**
 * Payment method types
 */
export type PaymentMethod = 'card' | 'bank_transfer' | 'cash' | 'paypal' | 'venmo' | 'zelle' | 'other';

/**
 * Event payment method types (Stripe vs Zelle)
 */
export type EventPaymentMethod = 'stripe' | 'zelle';

/**
 * Zelle payment instructions
 * Displayed to guest users when they select Zelle payment method
 */
export interface ZelleInstructions {
    recipientEmail: string;
    recipientPhone: string;
    amount: number; // Amount in cents
    currency: string;
    memo: string; // Transaction reference to include in Zelle transfer
    instructions: string[]; // Step-by-step instructions
}

/**
 * Payment Transaction (Extended for Guest Payments)
 * 
 * Collection: payment_transactions
 * 
 * This interface extends the existing PaymentTransaction to support guest payments
 * with OTP verification, Zelle manual verification, and custom invoicing.
 */
export interface PaymentTransaction {
    // Existing fields
    id: string;
    eventId: string;
    userId: string; // Empty string for guest payments
    attendeeId: string; // Reference to the attendee record
    amount: number; // Amount in cents
    currency: string;
    status: PaymentStatus;
    method: PaymentMethod;

    // Stripe-specific fields
    stripePaymentIntentId?: string;
    stripeChargeId?: string;

    // NEW: Guest payment fields
    /** Whether this is a guest payment (no user account) */
    isGuestPayment: boolean;

    /** Guest session token reference (for guest payments only) */
    guestSessionToken?: string;

    /** Guest contact information (for guest payments only) */
    guestContactInfo?: GuestContactInfo;

    // NEW: Zelle-specific fields
    /** Zelle payment instructions (for Zelle payments only) */
    zelleInstructions?: ZelleInstructions;

    // NEW: Admin verification fields (for Zelle payments)
    /** Admin user ID who verified the payment */
    verifiedBy?: string;

    /** Timestamp when payment was verified by admin */
    verifiedAt?: Timestamp;

    /** Admin notes about the verification */
    adminNotes?: string;

    // NEW: Invoice fields
    /** Invoice ID reference (for manually verified payments) */
    invoiceId?: string;

    /** Invoice number (for manually verified payments) */
    invoiceNumber?: string;

    // Existing metadata
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

        // NEW: Guest-specific metadata
        isGuest?: boolean;
        otpVerified?: boolean;
        sessionCreatedAt?: Timestamp;
    };

    // Timestamps
    createdAt: Timestamp;
    updatedAt: Timestamp;
    paidAt?: Timestamp;
}

/**
 * Payment intent creation result
 */
export interface PaymentIntentResponse {
    // For Stripe
    clientSecret?: string;
    paymentIntentId?: string;

    // For Zelle
    instructions?: ZelleInstructions;

    // Common
    transactionId: string;
    amount: number;
    currency: string;
}

/**
 * Admin payment verification request
 */
export interface MarkPaymentCompleteRequest {
    transactionId: string;
    adminNotes?: string;
}

/**
 * Admin payment verification response
 */
export interface MarkPaymentCompleteResponse {
    success: boolean;
    invoiceNumber?: string;
    invoiceUrl?: string;
    emailSent: boolean;
    error?: string;
    emailDebugId?: string;
}
