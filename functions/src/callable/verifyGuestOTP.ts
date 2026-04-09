import { getFirestore } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { GuestSessionService } from '../services/guestSessionService';
import { OTPServiceSimple } from '../services/otpServiceSimple';
import { GuestContactInfo } from '../types/guestSession';

/**
 * Verify Guest OTP Callable Function
 * Verifies OTP and creates guest session
 */

interface VerifyGuestOTPRequest {
    phone: string;
    code: string; // 6-digit OTP
    contactInfo: GuestContactInfo;
}

interface VerifyGuestOTPResponse {
    verified: boolean;
    sessionToken?: string;
    expiresAt?: string;
    error?: string;
    attemptsRemaining?: number;
    lockoutEndsAt?: string;
}

export const verifyGuestOTP = onCall(
    { region: 'us-east1' },
    async (request: CallableRequest<VerifyGuestOTPRequest>): Promise<VerifyGuestOTPResponse> => {
        try {
            const { phone, code, contactInfo } = request.data;

            // Validate required fields
            if (!phone || !code || !contactInfo) {
                throw new HttpsError(
                    'invalid-argument',
                    'Missing required fields: phone, code, contactInfo'
                );
            }

            // Validate contact info
            if (!contactInfo.firstName || !contactInfo.lastName || !contactInfo.email || !contactInfo.phone) {
                throw new HttpsError(
                    'invalid-argument',
                    'Incomplete contact information'
                );
            }

            // Validate phone format
            const phoneRegex = /^\+[1-9]\d{1,14}$/;
            if (!phoneRegex.test(phone)) {
                throw new HttpsError(
                    'invalid-argument',
                    'Invalid phone number format'
                );
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(contactInfo.email)) {
                throw new HttpsError(
                    'invalid-argument',
                    'Invalid email format'
                );
            }

            // Validate OTP code format (6 digits)
            if (!/^\d{6}$/.test(code)) {
                throw new HttpsError(
                    'invalid-argument',
                    'Invalid OTP code format. Must be 6 digits'
                );
            }

            // Initialize services (Simple OTP - uses configured SMS provider)
            const db = getFirestore();
            const otpService = new OTPServiceSimple(db);

            const sessionService = new GuestSessionService(db);

            // Verify OTP
            const verificationResult = await otpService.verifyOTP(phone, code);

            if (!verificationResult.verified) {
                return {
                    verified: false,
                    error: verificationResult.error,
                    attemptsRemaining: verificationResult.attemptsRemaining,
                    lockoutEndsAt: verificationResult.lockoutEndsAt?.toISOString()
                };
            }

            // Create guest session
            console.log('🔐 [OTP] Creating guest session for phone:', phone);
            const session = await sessionService.createSession(contactInfo, phone);
            console.log('✅ [OTP] Session created successfully');
            console.log('✅ [OTP] Session token (first 10 chars):', session.sessionToken.substring(0, 10) + '...');
            console.log('✅ [OTP] Session expires at:', session.expiresAt.toISOString());

            return {
                verified: true,
                sessionToken: session.sessionToken,
                expiresAt: session.expiresAt.toISOString()
            };
        } catch (error: any) {
            console.error('Error in verifyGuestOTP:', error);

            if (error instanceof HttpsError) {
                throw error;
            }

            throw new HttpsError('internal', 'Failed to verify OTP');
        }
    }
);
