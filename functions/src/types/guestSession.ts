import { Timestamp } from 'firebase-admin/firestore';

/**
 * Guest Contact Information
 * Collected from RSVP form before OTP verification
 */
export interface GuestContactInfo {
    firstName: string;
    lastName: string;
    email: string;
    phone: string; // E.164 format (e.g., +12025551234)
}

/**
 * Guest Session
 * Represents a temporary authenticated session for a guest user after OTP verification
 * 
 * Collection: guest_sessions
 * 
 * Security:
 * - sessionToken is encrypted before storage
 * - No direct client access (Cloud Functions only)
 * - Automatic expiration after 15 minutes
 * - Invalidated after successful payment
 */
export interface GuestSession {
    /** Encrypted session token (unique identifier) */
    sessionToken: string;

    /** Phone number in E.164 format (indexed for rate limiting) */
    phone: string;

    /** Guest contact information from RSVP form */
    contactInfo: GuestContactInfo;

    /** Whether OTP was successfully verified */
    verified: boolean;

    /** Session creation timestamp */
    createdAt: Timestamp;

    /** Session expiration timestamp (15 minutes from creation) */
    expiresAt: Timestamp;

    /** Last activity timestamp (updated on session validation) */
    lastActivity: Timestamp;

    /** Whether session has been invalidated */
    invalidated: boolean;

    /** Timestamp when session was invalidated (if applicable) */
    invalidatedAt?: Timestamp;

    /** Reason for invalidation */
    invalidationReason?: 'payment_complete' | 'expired' | 'manual';
}

/**
 * Session validation result
 */
export interface SessionValidationResult {
    valid: boolean;
    session?: GuestSession;
    error?: 'invalid_token' | 'expired' | 'invalidated' | 'not_found';
}

/**
 * Session creation result
 */
export interface SessionCreationResult {
    sessionToken: string;
    expiresAt: Date;
}
