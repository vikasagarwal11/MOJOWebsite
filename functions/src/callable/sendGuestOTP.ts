import { getFirestore } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { OTPServiceSimple } from '../services/otpServiceSimple';

/**
 * Send Guest OTP Callable Function
 * Sends OTP to guest user's phone number for verification
 */

interface SendGuestOTPRequest {
    phone: string; // E.164 format
    firstName: string;
    eventId: string;
}

interface SendGuestOTPResponse {
    success: boolean;
    requestId: string;
    expiresIn: number;
    attemptsRemaining: number;
    error?: string;
    lockoutEndsAt?: string;
}

export const sendGuestOTP = onCall(
    { region: 'us-east1' },
    async (request: CallableRequest<SendGuestOTPRequest>): Promise<SendGuestOTPResponse> => {
        try {
            const { phone, firstName, eventId } = request.data;

            // Validate required fields
            if (!phone || !firstName || !eventId) {
                throw new HttpsError(
                    'invalid-argument',
                    'Missing required fields: phone, firstName, eventId'
                );
            }

            // Validate phone format (E.164)
            const phoneRegex = /^\+[1-9]\d{1,14}$/;
            if (!phoneRegex.test(phone)) {
                throw new HttpsError(
                    'invalid-argument',
                    'Invalid phone number format. Must be E.164 format (e.g., +12025551234)'
                );
            }

            // Initialize OTP service (Simple version - uses your existing Twilio setup)
            const db = getFirestore();
            const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
            const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
            const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

            if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
                throw new HttpsError(
                    'failed-precondition',
                    'Twilio configuration not found'
                );
            }

            const otpService = new OTPServiceSimple(
                db,
                twilioAccountSid,
                twilioAuthToken,
                twilioPhoneNumber
            );

            // Send OTP
            const result = await otpService.sendOTP(phone, firstName);

            if (!result.success) {
                return {
                    success: false,
                    requestId: '',
                    expiresIn: 0,
                    attemptsRemaining: result.attemptsRemaining,
                    error: result.error,
                    lockoutEndsAt: result.lockoutEndsAt?.toISOString()
                };
            }

            return {
                success: true,
                requestId: result.requestId,
                expiresIn: result.expiresIn,
                attemptsRemaining: result.attemptsRemaining
            };
        } catch (error: any) {
            console.error('Error in sendGuestOTP:', error);

            if (error instanceof HttpsError) {
                throw error;
            }

            throw new HttpsError('internal', 'Failed to send OTP');
        }
    }
);
