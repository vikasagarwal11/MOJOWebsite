import { getFirestore } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { GuestPaymentService } from '../services/guestPaymentService';
import { GuestSessionService } from '../services/guestSessionService';
import { PaymentIntentResponse } from '../types/paymentTransaction';

/**
 * Create Guest Payment Intent Callable Function
 * Creates payment intent for guest user with session validation
 */

interface CreateGuestPaymentIntentRequest {
    sessionToken: string;
    eventId: string;
    paymentMethod: 'stripe' | 'zelle';
    attendeeIds?: string[];
}

export const createGuestPaymentIntent = onCall(
    { region: 'us-east1' },
    async (request: CallableRequest<CreateGuestPaymentIntentRequest>): Promise<PaymentIntentResponse> => {
        try {
            const { sessionToken, eventId, paymentMethod, attendeeIds } = request.data;

            console.log('💳 [PAYMENT] createGuestPaymentIntent called');
            console.log('💳 [PAYMENT] Session token received (first 10 chars):', sessionToken?.substring(0, 10) + '...');
            console.log('💳 [PAYMENT] Event ID:', eventId);
            console.log('💳 [PAYMENT] Payment method:', paymentMethod);

            // Validate required fields
            if (!sessionToken || !eventId || !paymentMethod) {
                throw new HttpsError(
                    'invalid-argument',
                    'Missing required fields: sessionToken, eventId, paymentMethod'
                );
            }

            // Validate payment method
            if (paymentMethod !== 'stripe' && paymentMethod !== 'zelle') {
                throw new HttpsError(
                    'invalid-argument',
                    'Invalid payment method. Must be "stripe" or "zelle"'
                );
            }

            // Initialize services
            const db = getFirestore();
            const sessionService = new GuestSessionService(db);

            const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
            if (!stripeSecretKey) {
                throw new HttpsError(
                    'failed-precondition',
                    'Stripe configuration not found'
                );
            }

            const paymentService = new GuestPaymentService(
                db,
                stripeSecretKey,
                sessionService
            );

            // Create payment intent
            const paymentIntent = await paymentService.createGuestPaymentIntent(
                sessionToken,
                eventId,
                paymentMethod,
                attendeeIds
            );

            return paymentIntent;
        } catch (error: any) {
            console.error('❌ [CALLABLE] Error in createGuestPaymentIntent:', error);
            console.error('❌ [CALLABLE] Error type:', typeof error);
            console.error('❌ [CALLABLE] Error constructor:', error?.constructor?.name);
            console.error('❌ [CALLABLE] Error message:', error?.message);
            console.error('❌ [CALLABLE] Error stack:', error?.stack);

            if (error instanceof HttpsError) {
                throw error;
            }

            // Handle specific errors
            if (error.message && error.message.includes('Invalid session')) {
                throw new HttpsError('unauthenticated', error.message);
            }

            if (error.message && error.message.includes('Event not found')) {
                throw new HttpsError('not-found', 'Event not found');
            }

            if (error.message && error.message.includes('does not require payment')) {
                throw new HttpsError('failed-precondition', 'Event does not require payment');
            }

            if (error.message && error.message.includes('No attendees found')) {
                throw new HttpsError('not-found', error.message);
            }

            // Return the actual error message for debugging
            const errorMessage = error?.message || 'Failed to create payment intent';
            console.error('❌ [CALLABLE] Throwing internal error with message:', errorMessage);
            throw new HttpsError('internal', errorMessage);
        }
    }
);
