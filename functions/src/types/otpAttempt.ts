import { Timestamp } from 'firebase-admin/firestore';

/**
 * OTP Attempt
 * Tracks OTP verification attempts for rate limiting and security
 * 
 * Collection: otp_attempts
 * Document ID: phone number (E.164 format)
 * 
 * Security:
 * - No direct client access (Cloud Functions only)
 * - Automatic cleanup after 1 hour (TTL)
 * - Rate limiting: 3 attempts per 10-minute window
 * - Lockout: 10 minutes after 3 failed attempts
 */
export interface OTPAttempt {
    /** Phone number in E.164 format (document ID) */
    phone: string;

    /** SMS provider message/request ID */
    requestId: string;

    /** Number of verification attempts made */
    attempts: number;

    /** Timestamp of last verification attempt */
    lastAttempt: Timestamp;

    /** Timestamp when lockout ends (null if not locked) */
    lockedUntil: Timestamp | null;

    /** Timestamp when OTP was first requested */
    createdAt: Timestamp;

    /** Timestamp when this record expires (1 hour from creation) */
    expiresAt: Timestamp;

    /** Whether OTP verification was successful */
    successful: boolean;

    /** Session token created on successful verification */
    sessionToken?: string;

    /** The OTP code (only for simple/manual OTP) */
    otpCode?: string;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
    /** Whether the request is allowed */
    allowed: boolean;

    /** Number of attempts remaining before lockout */
    attemptsRemaining: number;

    /** Timestamp when lockout ends (null if not locked) */
    lockoutEndsAt: Date | null;
}

/**
 * OTP verification result
 */
export interface OTPVerificationResult {
    /** Whether OTP was verified successfully */
    verified: boolean;

    /** Session token (only if verified) */
    sessionToken?: string;

    /** Session expiration timestamp (only if verified) */
    expiresAt?: Date;

    /** Error code if verification failed */
    error?: 'invalid_code' | 'expired_code' | 'max_attempts_exceeded' | 'rate_limit_exceeded';

    /** Number of attempts remaining */
    attemptsRemaining?: number;

    /** Lockout end timestamp if rate limited */
    lockoutEndsAt?: Date;
}

/**
 * OTP send result
 */
export interface OTPSendResult {
    /** Whether OTP was sent successfully */
    success: boolean;

    /** SMS provider request ID */
    requestId: string;

    /** Seconds until OTP expires */
    expiresIn: number;

    /** Number of attempts remaining */
    attemptsRemaining: number;

    /** Error code if send failed */
    error?: 'invalid_phone' | 'rate_limit_exceeded' | 'service_unavailable';

    /** Lockout end timestamp if rate limited */
    lockoutEndsAt?: Date;
}
