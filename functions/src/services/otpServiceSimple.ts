import { Firestore, Timestamp } from 'firebase-admin/firestore';
import Twilio from 'twilio';
import {
    OTPAttempt,
    OTPSendResult,
    OTPVerificationResult,
    RateLimitResult
} from '../types/otpAttempt';

/**
 * OTP Service (Simple Version)
 * Uses Twilio Messaging API (same as your existing notifications.ts)
 * No need for TWILIO_VERIFY_SERVICE_SID - just uses your existing credentials!
 * 
 * Implements:
 * - Manual OTP generation (6-digit codes)
 * - Rate limiting (3 attempts per 10-minute window)
 * - 10-minute lockout after max attempts
 * - OTP expiry (10 minutes)
 */
export class OTPServiceSimple {
    private db: Firestore;
    private twilioClient: Twilio.Twilio;
    private twilioPhoneNumber: string;

    constructor(
        db: Firestore,
        twilioAccountSid: string,
        twilioAuthToken: string,
        twilioPhoneNumber: string
    ) {
        this.db = db;
        this.twilioClient = Twilio(twilioAccountSid, twilioAuthToken);
        this.twilioPhoneNumber = twilioPhoneNumber;
    }

    /**
     * Generate a random 6-digit OTP code
     */
    private generateOTP(): string {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    /**
     * Send OTP to phone number using Twilio Messaging API
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

            // Generate OTP code
            const otpCode = this.generateOTP();

            // Send SMS using Twilio Messaging API (same as your notifications.ts)
            const message = `Hi ${firstName}! Your verification code is: ${otpCode}\n\nThis code expires in 10 minutes.\n\n- Moms Fitness Mojo`;

            const result = await this.twilioClient.messages.create({
                body: message,
                from: this.twilioPhoneNumber,
                to: phone,
            });

            console.log(`✅ OTP SMS sent via Twilio. SID: ${result.sid}`);

            // Store OTP attempt in database
            const attemptRef = this.db.collection('otp_attempts').doc(phone);
            const now = Timestamp.now();
            const expiresAt = Timestamp.fromMillis(Date.now() + 10 * 60 * 1000); // 10 minutes

            const otpAttempt: OTPAttempt = {
                phone,
                requestId: result.sid, // Twilio message SID
                attempts: 0,
                lastAttempt: now,
                lockedUntil: null,
                createdAt: now,
                expiresAt: expiresAt,
                successful: false,
                // Store the OTP code (encrypted in production)
                otpCode: otpCode
            };

            await attemptRef.set(otpAttempt);

            return {
                success: true,
                requestId: result.sid,
                expiresIn: 600, // 10 minutes in seconds
                attemptsRemaining: rateLimit.attemptsRemaining
            };
        } catch (error: any) {
            console.error('❌ Error sending OTP:', error);

            // Twilio error codes
            if (error.code === 21211 || error.code === 21614) {
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

            // Check if OTP has expired
            if (attempt.expiresAt.toDate() < new Date()) {
                return {
                    verified: false,
                    error: 'expired_code',
                    attemptsRemaining: 0
                };
            }

            // Verify OTP code
            if (attempt.otpCode === code) {
                // OTP verified successfully
                await attemptRef.update({
                    successful: true,
                    attempts: 0 // Reset attempts on success
                });

                console.log(`✅ OTP verified successfully for ${phone}`);

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

                    console.warn(`⚠️ Max OTP attempts exceeded for ${phone}. Locked out for 10 minutes.`);

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

                console.warn(`⚠️ Invalid OTP code for ${phone}. Attempts: ${newAttempts}/3`);

                return {
                    verified: false,
                    error: 'invalid_code',
                    attemptsRemaining: 3 - newAttempts
                };
            }
        } catch (error: any) {
            console.error('❌ Error verifying OTP:', error);

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
