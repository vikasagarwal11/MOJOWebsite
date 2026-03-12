import { Firestore, Timestamp } from 'firebase-admin/firestore';
import Twilio from 'twilio';
import {
    OTPAttempt,
    OTPSendResult,
    OTPVerificationResult,
    RateLimitResult
} from '../types/otpAttempt';

/**
 * OTP Service
 * Handles OTP generation, sending, and verification using Twilio Verify API
 * Implements rate limiting (3 attempts per 10-minute window, 10-minute lockout)
 */
export class OTPService {
    private db: Firestore;
    private twilioClient: Twilio.Twilio;
    private verifyServiceSid: string;

    constructor(
        db: Firestore,
        twilioAccountSid: string,
        twilioAuthToken: string,
        twilioVerifyServiceSid: string
    ) {
        this.db = db;
        this.twilioClient = Twilio(twilioAccountSid, twilioAuthToken);
        this.verifyServiceSid = twilioVerifyServiceSid;
    }

    /**
     * Send OTP to phone number
     * @param phone - E.164 formatted phone number
     * @param firstName - User's first name for personalization
     * @returns OTP send result with request ID and attempts remaining
     */
    async sendOTP(phone: string, firstName: string): Promise<OTPSendResult> {
        try {
            // Check rate limiting
            const rateLimit = await this.checkRateLimit(phone);

            if (!rateLimit.allowed) {
                return {
                    success: false,
                    requestId: '',
                    expiresIn: 0,
                    attemptsRemaining: 0,
                    error: 'rate_limit_exceeded',
                    lockoutEndsAt: rateLimit.lockoutEndsAt || undefined
                };
            }

            // Send OTP via Twilio Verify
            const verification = await this.twilioClient.verify.v2
                .services(this.verifyServiceSid)
                .verifications
                .create({
                    to: phone,
                    channel: 'sms',
                    locale: 'en'
                });

            // Store OTP attempt
            const attemptRef = this.db.collection('otp_attempts').doc(phone);
            const attemptDoc = await attemptRef.get();

            const now = Timestamp.now();
            const expiresAt = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000); // 1 hour

            if (attemptDoc.exists) {
                await attemptRef.update({
                    requestId: verification.sid,
                    lastAttempt: now,
                    expiresAt: expiresAt
                });
            } else {
                const otpAttempt: OTPAttempt = {
                    phone,
                    requestId: verification.sid,
                    attempts: 0,
                    lastAttempt: now,
                    lockedUntil: null,
                    createdAt: now,
                    expiresAt: expiresAt,
                    successful: false
                };
                await attemptRef.set(otpAttempt);
            }

            return {
                success: true,
                requestId: verification.sid,
                expiresIn: 300, // 5 minutes
                attemptsRemaining: rateLimit.attemptsRemaining
            };
        } catch (error: any) {
            console.error('Error sending OTP:', error);

            if (error.code === 60200 || error.code === 60203) {
                return {
                    success: false,
                    requestId: '',
                    expiresIn: 0,
                    attemptsRemaining: 0,
                    error: 'invalid_phone'
                };
            }

            return {
                success: false,
                requestId: '',
                expiresIn: 0,
                attemptsRemaining: 0,
                error: 'service_unavailable'
            };
        }
    }

    /**
     * Verify OTP code
     * @param phone - Phone number
     * @param code - 6-digit OTP code
     * @returns Verification result with session token if successful
     */
    async verifyOTP(phone: string, code: string): Promise<OTPVerificationResult> {
        try {
            // Check rate limiting
            const rateLimit = await this.checkRateLimit(phone);

            if (!rateLimit.allowed) {
                return {
                    verified: false,
                    error: 'rate_limit_exceeded',
                    attemptsRemaining: 0,
                    lockoutEndsAt: rateLimit.lockoutEndsAt || undefined
                };
            }

            // Get OTP attempt record
            const attemptRef = this.db.collection('otp_attempts').doc(phone);
            const attemptDoc = await attemptRef.get();

            if (!attemptDoc.exists) {
                return {
                    verified: false,
                    error: 'invalid_code',
                    attemptsRemaining: 3
                };
            }

            const attempt = attemptDoc.data() as OTPAttempt;

            // Verify OTP with Twilio
            const verificationCheck = await this.twilioClient.verify.v2
                .services(this.verifyServiceSid)
                .verificationChecks
                .create({
                    to: phone,
                    code: code
                });

            if (verificationCheck.status === 'approved') {
                // OTP verified successfully
                await attemptRef.update({
                    successful: true,
                    attempts: 0 // Reset attempts on success
                });

                return {
                    verified: true
                };
            } else {
                // OTP verification failed
                const newAttempts = attempt.attempts + 1;

                // Check if max attempts exceeded
                if (newAttempts >= 3) {
                    const lockoutEndsAt = Timestamp.fromMillis(Date.now() + 10 * 60 * 1000); // 10 minutes
                    await attemptRef.update({
                        attempts: newAttempts,
                        lockedUntil: lockoutEndsAt,
                        lastAttempt: Timestamp.now()
                    });

                    return {
                        verified: false,
                        error: 'max_attempts_exceeded',
                        attemptsRemaining: 0,
                        lockoutEndsAt: lockoutEndsAt.toDate()
                    };
                }

                await attemptRef.update({
                    attempts: newAttempts,
                    lastAttempt: Timestamp.now()
                });

                return {
                    verified: false,
                    error: 'invalid_code',
                    attemptsRemaining: 3 - newAttempts
                };
            }
        } catch (error: any) {
            console.error('Error verifying OTP:', error);

            if (error.code === 60202) {
                return {
                    verified: false,
                    error: 'expired_code',
                    attemptsRemaining: 0
                };
            }

            return {
                verified: false,
                error: 'invalid_code',
                attemptsRemaining: 0
            };
        }
    }

    /**
     * Check rate limiting for phone number
     * @param phone - Phone number to check
     * @returns Rate limit status
     */
    async checkRateLimit(phone: string): Promise<RateLimitResult> {
        const attemptRef = this.db.collection('otp_attempts').doc(phone);
        const attemptDoc = await attemptRef.get();

        if (!attemptDoc.exists) {
            return {
                allowed: true,
                attemptsRemaining: 3,
                lockoutEndsAt: null
            };
        }

        const attempt = attemptDoc.data() as OTPAttempt;
        const now = new Date();

        // Check if locked out
        if (attempt.lockedUntil && attempt.lockedUntil.toDate() > now) {
            return {
                allowed: false,
                attemptsRemaining: 0,
                lockoutEndsAt: attempt.lockedUntil.toDate()
            };
        }

        // Check if window has expired (10 minutes)
        const windowStart = new Date(Date.now() - 10 * 60 * 1000);
        if (attempt.lastAttempt.toDate() < windowStart) {
            // Reset attempts - window expired
            await attemptRef.update({
                attempts: 0,
                lockedUntil: null
            });

            return {
                allowed: true,
                attemptsRemaining: 3,
                lockoutEndsAt: null
            };
        }

        // Check attempt count
        if (attempt.attempts >= 3) {
            // Lock out for 10 minutes
            const lockoutEndsAt = new Date(Date.now() + 10 * 60 * 1000);
            await attemptRef.update({
                lockedUntil: Timestamp.fromDate(lockoutEndsAt)
            });

            return {
                allowed: false,
                attemptsRemaining: 0,
                lockoutEndsAt
            };
        }

        return {
            allowed: true,
            attemptsRemaining: 3 - attempt.attempts,
            lockoutEndsAt: null
        };
    }

    /**
     * Clean up expired OTP attempts
     * Called by scheduled function
     */
    async cleanupExpiredAttempts(): Promise<number> {
        const now = Timestamp.now();
        const expiredQuery = await this.db
            .collection('otp_attempts')
            .where('expiresAt', '<', now)
            .limit(500)
            .get();

        const batch = this.db.batch();
        expiredQuery.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        return expiredQuery.size;
    }
}
