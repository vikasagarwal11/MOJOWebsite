import { getFirestore } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { GuestSessionService } from '../services/guestSessionService';
import { OTPServiceSimple } from '../services/otpServiceSimple';

/**
 * Cleanup Expired Sessions Scheduled Function
 * Runs every 15 minutes to clean up expired guest sessions and OTP attempts
 */

export const cleanupExpiredSessions = onSchedule(
    {
        schedule: 'every 15 minutes',
        region: 'us-east1',
        timeZone: 'America/New_York'
    },
    async (event) => {
        try {
            const db = getFirestore();

            // Initialize services (Simple OTP - uses your existing Twilio setup)
            const sessionService = new GuestSessionService(db);

            const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
            const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
            const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

            if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
                console.error('Twilio configuration not found');
                return;
            }

            const otpService = new OTPServiceSimple(
                db,
                twilioAccountSid,
                twilioAuthToken,
                twilioPhoneNumber
            );

            // Clean up expired sessions
            const expiredSessionsCount = await sessionService.cleanupExpiredSessions();
            console.log(`Cleaned up ${expiredSessionsCount} expired guest sessions`);

            // Clean up invalidated sessions older than 24 hours
            const invalidatedSessionsCount = await sessionService.cleanupInvalidatedSessions();
            console.log(`Cleaned up ${invalidatedSessionsCount} invalidated guest sessions`);

            // Clean up expired OTP attempts
            const expiredOTPCount = await otpService.cleanupExpiredAttempts();
            console.log(`Cleaned up ${expiredOTPCount} expired OTP attempts`);

            // Log cleanup stats
            await db.collection('cleanup_logs').add({
                timestamp: new Date(),
                expiredSessions: expiredSessionsCount,
                invalidatedSessions: invalidatedSessionsCount,
                expiredOTPAttempts: expiredOTPCount,
                totalCleaned: expiredSessionsCount + invalidatedSessionsCount + expiredOTPCount
            });

            console.log('Cleanup completed successfully');
        } catch (error) {
            console.error('Error in cleanupExpiredSessions:', error);
            throw error;
        }
    }
);
