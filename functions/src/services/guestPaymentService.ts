import { Firestore, Timestamp } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { calculateAttendeePrice, calculateChargeAmount } from '../stripe';
import {
    PaymentIntentResponse,
    PaymentTransaction,
    ZelleInstructions
} from '../types/paymentTransaction';
import { GuestSessionService } from './guestSessionService';

/**
 * Guest Payment Service
 * Handles payment processing for guest users with session validation
 */
export class GuestPaymentService {
    private db: Firestore;
    private stripe: Stripe;
    private sessionService: GuestSessionService;

    constructor(
        db: Firestore,
        stripeSecretKey: string,
        sessionService: GuestSessionService
    ) {
        this.db = db;
        this.stripe = new Stripe(stripeSecretKey, {
            apiVersion: '2025-12-15.clover'
        });
        this.sessionService = sessionService;
    }

    /**
     * Create payment intent for guest user
     * @param sessionToken - Valid session token
     * @param eventId - Event ID
     * @param paymentMethod - 'stripe' or 'zelle'
     * @returns Payment intent or instructions
     */
    async createGuestPaymentIntent(
        sessionToken: string,
        eventId: string,
        paymentMethod: 'stripe' | 'zelle',
        attendeeIds?: string[]
    ): Promise<PaymentIntentResponse> {
        try {
            console.log('💳 [GUEST PAYMENT] Starting payment intent creation');
            console.log('💳 [GUEST PAYMENT] Event ID:', eventId);
            console.log('💳 [GUEST PAYMENT] Payment method:', paymentMethod);

            // Validate session
            const validation = await this.sessionService.validateSession(sessionToken);

            if (!validation.valid || !validation.session) {
                console.error('❌ [GUEST PAYMENT] Session validation failed:', validation.error);
                throw new Error(`Invalid session: ${validation.error}`);
            }

            const session = validation.session;
            console.log('✅ [GUEST PAYMENT] Session validated for phone:', session.phone);

            // Get event details
            console.log('🔍 [GUEST PAYMENT] Fetching event details...');
            const eventDoc = await this.db.collection('events').doc(eventId).get();

            if (!eventDoc.exists) {
                console.error('❌ [GUEST PAYMENT] Event not found:', eventId);
                throw new Error('Event not found');
            }

            const event = eventDoc.data();

            if (!event) {
                console.error('❌ [GUEST PAYMENT] Event data is null');
                throw new Error('Event data not found');
            }

            // Check if payment is required
            if (!event.pricing?.requiresPayment && !event.pricing?.eventSupportAmount) {
                console.error('❌ [GUEST PAYMENT] Event does not require payment');
                throw new Error('Event does not require payment');
            }

            console.log('💰 [GUEST PAYMENT] Event pricing:', event.pricing);

            // Find all attendees for this guest user
            // Guest userId format: guest_${eventId}_${phoneDigits}
            const phoneDigits = session.phone.replace(/[^\d]/g, '');
            const expectedGuestUserId = `guest_${eventId}_${phoneDigits}`;

            console.log('🔍 [GUEST PAYMENT] Looking for guest userId:', expectedGuestUserId);
            console.log('🔍 [GUEST PAYMENT] Guest phone (E164):', session.phone);

            // Try querying by userId first (most reliable)
            let attendeesSnapshot = await this.db
                .collection('events')
                .doc(eventId)
                .collection('attendees')
                .where('userId', '==', expectedGuestUserId)
                .where('rsvpStatus', '==', 'going')
                .get();

            console.log('👥 [GUEST PAYMENT] Attendees found by userId:', attendeesSnapshot.size);

            // Fallback: Try querying by guestPhone if userId query returns nothing
            if (attendeesSnapshot.empty) {
                console.log('🔄 [GUEST PAYMENT] Trying fallback query by guestPhone...');
                attendeesSnapshot = await this.db
                    .collection('events')
                    .doc(eventId)
                    .collection('attendees')
                    .where('guestPhone', '==', session.phone)
                    .where('rsvpStatus', '==', 'going')
                    .get();

                console.log('👥 [GUEST PAYMENT] Attendees found by guestPhone:', attendeesSnapshot.size);
            }

            if (attendeesSnapshot.empty) {
                console.error('❌ [GUEST PAYMENT] No attendees found for phone:', session.phone);
                console.error('❌ [GUEST PAYMENT] Expected userId:', expectedGuestUserId);

                // Debug: List all attendees in the event to help troubleshoot
                const allAttendees = await this.db
                    .collection('events')
                    .doc(eventId)
                    .collection('attendees')
                    .limit(10)
                    .get();

                console.error('🔍 [GUEST PAYMENT] Sample attendees in event:',
                    allAttendees.docs.map(d => ({
                        id: d.id,
                        userId: d.data().userId,
                        guestPhone: d.data().guestPhone,
                        rsvpStatus: d.data().rsvpStatus
                    }))
                );

                throw new Error('No attendees found for this guest. Please submit your RSVP first.');
            }

            const guestAttendees = attendeesSnapshot.docs;

            // Filter to only unpaid attendees
            let unpaidAttendees = guestAttendees.filter(doc => {
                const data = doc.data();
                return data.paymentStatus !== 'paid';
            });

            if (attendeeIds && attendeeIds.length > 0) {
                const requestedSet = new Set(attendeeIds);
                const beforeCount = unpaidAttendees.length;
                unpaidAttendees = unpaidAttendees.filter(doc => requestedSet.has(doc.id));
                const missingIds = attendeeIds.filter(id => !guestAttendees.some(doc => doc.id === id));

                console.log('🧾 [GUEST PAYMENT] Requested attendee IDs:', attendeeIds);
                console.log('🧾 [GUEST PAYMENT] Unpaid attendees before filter:', beforeCount);
                console.log('🧾 [GUEST PAYMENT] Unpaid attendees after filter:', unpaidAttendees.length);
                if (missingIds.length > 0) {
                    console.warn('⚠️ [GUEST PAYMENT] Requested attendee IDs not found for this guest:', missingIds);
                }

                // Fallback: if filtering by attendeeIds yields nothing but there are unpaid attendees,
                // use all unpaid attendees to avoid blocking guest payments due to stale IDs.
                if (unpaidAttendees.length === 0 && beforeCount > 0) {
                    console.warn('⚠️ [GUEST PAYMENT] No matches after attendeeId filter. Falling back to all unpaid attendees.');
                    unpaidAttendees = guestAttendees.filter(doc => {
                        const data = doc.data();
                        return data.paymentStatus !== 'paid';
                    });
                }
            }

            console.log('💳 [GUEST PAYMENT] Unpaid attendees:', unpaidAttendees.length);

            if (unpaidAttendees.length === 0) {
                // Fallback: if we still have no unpaid attendees but attendeeIds were provided,
                // try to fetch by attendeeIds directly and validate against guest contact.
                if (attendeeIds && attendeeIds.length > 0) {
                    console.warn('⚠️ [GUEST PAYMENT] No unpaid attendees after guest lookup. Attempting direct attendeeId lookup fallback.');
                    const fetchedDocs = await Promise.all(
                        attendeeIds.map(async (id) => {
                            const ref = this.db.collection('events').doc(eventId).collection('attendees').doc(id);
                            const snap = await ref.get();
                            return snap.exists ? snap : null;
                        })
                    );
                    const validDocs = fetchedDocs.filter(
                        (d): d is FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData> => !!d
                    );
                    const guestEmail = session.contactInfo?.email?.toLowerCase?.() || '';
                    const guestPhone = session.phone;

                    const fallbackUnpaid = validDocs.filter((doc) => {
                        const data = doc.data() as any;
                        if (!data) return false;
                        if (data.paymentStatus === 'paid') return false;
                        const emailMatch = (data.guestEmail || '').toLowerCase() === guestEmail;
                        const phoneMatch = (data.guestPhone || '') === guestPhone;
                        const isGuest = data.isGuest === true;
                        return isGuest && (emailMatch || phoneMatch);
                    });

                    if (fallbackUnpaid.length > 0) {
                        console.warn('⚠️ [GUEST PAYMENT] Fallback by attendeeIds succeeded.');
                        unpaidAttendees = fallbackUnpaid.map((snap) => snap as unknown as FirebaseFirestore.QueryDocumentSnapshot);
                    }
                }

                if (unpaidAttendees.length === 0) {
                    throw new Error('No unpaid attendees found for this guest selection.');
                }
            }

            // Convert Firestore documents to Attendee objects for payment calculation
            const attendeeObjects = unpaidAttendees.map(doc => {
                const data = doc.data();
                return {
                    attendeeId: doc.id,
                    eventId: eventId,
                    userId: data.userId,
                    attendeeType: data.attendeeType,
                    relationship: data.relationship,
                    name: data.name,
                    ageGroup: data.ageGroup,
                    rsvpStatus: 'going' as const,
                    paymentStatus: data.paymentStatus,
                    createdAt: data.createdAt?.toDate() || new Date(),
                    updatedAt: data.updatedAt?.toDate() || new Date()
                };
            });

            // CRITICAL: Use EXACT calculation logic from stripe.ts calculateIncrementalAmount
            // This is the SAME logic used for authenticated users

            console.log('🔍 [CALCULATION START] Beginning payment calculation');
            console.log('🔍 [CALCULATION] Event pricing:', JSON.stringify(event.pricing, null, 2));
            console.log('🔍 [CALCULATION] Unpaid attendees count:', unpaidAttendees.length);

            // Build unpaid attendees array with NET prices
            const unpaidAttendeesWithPrices = unpaidAttendees.map(doc => {
                const data = doc.data();
                const ageGroup = data.ageGroup || 'adult';
                const price = calculateAttendeePrice(ageGroup, event.pricing);

                console.log(`💰 [CALCULATION] Attendee "${data.name}" (${ageGroup}): $${(price / 100).toFixed(2)} (${price} cents)`);

                return {
                    attendeeId: doc.id,
                    name: data.name || 'Guest',
                    ageGroup,
                    price
                };
            });

            // Calculate total NET amount for unpaid attendees
            let netTotal = unpaidAttendeesWithPrices.reduce((sum, att) => sum + att.price, 0);
            console.log(`📊 [CALCULATION] Sum of attendee prices: $${(netTotal / 100).toFixed(2)} (${netTotal} cents)`);

            // Add event support amount per unpaid attendee if applicable (NET amount)
            const hasEventSupportAmount = event.pricing.eventSupportAmount && event.pricing.eventSupportAmount > 0;
            if (hasEventSupportAmount) {
                const eventSupportTotal = event.pricing.eventSupportAmount * unpaidAttendees.length;
                console.log(
                    `🎗️ [CALCULATION] Event support: ${unpaidAttendees.length} attendees × $${(event.pricing.eventSupportAmount / 100).toFixed(2)} = $${(eventSupportTotal / 100).toFixed(2)} (${eventSupportTotal} cents)`
                );
                netTotal += eventSupportTotal;
                console.log(`📊 [CALCULATION] Net total after event support: $${(netTotal / 100).toFixed(2)} (${netTotal} cents)`);
            }

            console.log(`📊 [CALCULATION] FINAL NET TOTAL (admin receives): $${(netTotal / 100).toFixed(2)} (${netTotal} cents)`);

            // Check if this is a Zelle payment (no Stripe fees)
            const isZellePayment = paymentMethod === 'zelle';

            let totalAmount: number;
            if (isZellePayment) {
                // For Zelle payments, charge the exact NET amount (no Stripe fees)
                totalAmount = netTotal;
                console.log(`💵 [CALCULATION] Zelle payment - using NET amount: $${(totalAmount / 100).toFixed(2)} (${totalAmount} cents)`);
            } else {
                // For Stripe payments, apply Stripe fees
                console.log(`💳 [CALCULATION] Calling calculateChargeAmount(${netTotal})`);
                totalAmount = calculateChargeAmount(netTotal);
                console.log(`� [CALCULATION] Stripe payment - CHARGE TOTAL (includes fees): $${(totalAmount / 100).toFixed(2)} (${totalAmount} cents)`);
                console.log(`📊 [CALCULATION] Stripe fee: $${((totalAmount - netTotal) / 100).toFixed(2)} (${(totalAmount - netTotal)} cents)`);
            }

            console.log(`🎯 [CALCULATION END] FINAL AMOUNT TO CHARGE: $${(totalAmount / 100).toFixed(2)} (${totalAmount} cents)`)

            // Build breakdown for metadata
            const attendeeBreakdown = unpaidAttendeesWithPrices.map(att => ({
                attendeeId: att.attendeeId,
                attendeeName: att.name,
                ageGroup: att.ageGroup,
                price: att.price,
                quantity: 1,
                subtotal: att.price
            }));

            console.log('💰 [GUEST PAYMENT] Total amount calculated:', {
                attendeeCount: unpaidAttendees.length,
                netTotal,
                totalAmount,
                isZelle: isZellePayment,
                breakdown: attendeeBreakdown
            });

            console.log(`🚨 [CRITICAL CHECK] About to send to Stripe: $${(totalAmount / 100).toFixed(2)} (${totalAmount} cents)`);

            // Validate total amount
            if (totalAmount <= 0) {
                console.error('❌ [GUEST PAYMENT] Invalid total amount:', totalAmount);
                throw new Error('Invalid payment amount. Total must be greater than zero.');
            }

            const currency = event.pricing.currency || 'usd';

            // Create transaction record
            const transactionId = this.db.collection('payment_transactions').doc().id;

            // Format breakdown for metadata (using the calculated breakdown)
            const formattedBreakdown = attendeeBreakdown.map(item => ({
                attendeeId: item.attendeeId,
                attendeeName: item.attendeeName,
                ageGroup: item.ageGroup,
                price: item.price,
                quantity: item.quantity,
                subtotal: item.subtotal
            }));

            // Format paid attendees for metadata
            const formattedPaidAttendees = attendeeBreakdown.map(item => ({
                attendeeId: item.attendeeId,
                name: item.attendeeName,
                ageGroup: item.ageGroup,
                amount: item.price
            }));

            const transaction: Partial<PaymentTransaction> = {
                id: transactionId,
                eventId,
                userId: guestAttendees[0].data().userId, // Use the guest userId
                attendeeId: '', // Will be updated with all attendee IDs
                amount: totalAmount,
                currency,
                status: paymentMethod === 'stripe' ? 'unpaid' : 'pending',
                method: paymentMethod === 'stripe' ? 'card' : 'zelle',
                isGuestPayment: true,
                guestSessionToken: sessionToken,
                guestContactInfo: session.contactInfo,
                metadata: {
                    attendeeName: `${session.contactInfo.firstName} ${session.contactInfo.lastName}`,
                    ageGroup: 'adult',
                    eventTitle: event.title || 'Event',
                    eventDate: event.startAt?.toDate().toISOString() || '',
                    totalAttendees: unpaidAttendees.length,
                    breakdown: formattedBreakdown,
                    paidAttendees: formattedPaidAttendees,
                    isGuest: true,
                    otpVerified: true,
                    sessionCreatedAt: session.createdAt
                },
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now()
            };

            if (paymentMethod === 'stripe') {
                return await this.processStripePayment(transaction, transactionId);
            } else {
                return await this.createZelleTransaction(transaction, transactionId);
            }
        } catch (error: any) {
            console.error('❌ [GUEST PAYMENT] Error in createGuestPaymentIntent:', error);
            console.error('❌ [GUEST PAYMENT] Error stack:', error.stack);
            console.error('❌ [GUEST PAYMENT] Error message:', error.message);
            throw error;
        }
    }

    /**
     * Process Stripe payment for guest
     * @param transaction - Transaction data
     * @param transactionId - Transaction ID
     * @returns Payment intent response
     */
    private async processStripePayment(
        transaction: Partial<PaymentTransaction>,
        transactionId: string
    ): Promise<PaymentIntentResponse> {
        try {
            console.log('💳 [STRIPE] Creating payment intent...');
            console.log('💳 [STRIPE] Transaction ID:', transactionId);
            console.log(`💳 [STRIPE] Amount from transaction object: $${(transaction.amount! / 100).toFixed(2)} (${transaction.amount} cents)`);
            console.log('💳 [STRIPE] Currency:', transaction.currency);

            // Validate amount before calling Stripe
            if (!transaction.amount || transaction.amount <= 0) {
                throw new Error(`Invalid amount for Stripe: ${transaction.amount}`);
            }

            console.log(`🚨 [FINAL CHECK] Calling Stripe API with amount: ${transaction.amount} cents ($${(transaction.amount / 100).toFixed(2)})`);

            // Create Stripe payment intent
            const paymentIntent = await this.stripe.paymentIntents.create({
                amount: transaction.amount!,
                currency: transaction.currency!,
                automatic_payment_methods: {
                    enabled: true,
                },
                metadata: {
                    transactionId,
                    eventId: transaction.eventId!,
                    isGuest: 'true',
                    customerEmail: transaction.guestContactInfo!.email,
                    customerName: `${transaction.guestContactInfo!.firstName} ${transaction.guestContactInfo!.lastName}`
                },
                receipt_email: transaction.guestContactInfo!.email
            });

            console.log('✅ [STRIPE] Payment intent created:', paymentIntent.id);
            console.log(`✅ [STRIPE] Stripe confirmed amount: $${(paymentIntent.amount / 100).toFixed(2)} (${paymentIntent.amount} cents)`);

            // Update transaction with Stripe payment intent ID
            transaction.stripePaymentIntentId = paymentIntent.id;

            // Save transaction
            console.log('💾 [STRIPE] Saving transaction to Firestore...');
            await this.db
                .collection('payment_transactions')
                .doc(transactionId)
                .set(transaction as PaymentTransaction);

            console.log('✅ [STRIPE] Transaction saved successfully');

            return {
                clientSecret: paymentIntent.client_secret!,
                paymentIntentId: paymentIntent.id,
                transactionId,
                amount: transaction.amount!,
                currency: transaction.currency!
            };
        } catch (error: any) {
            console.error('❌ [STRIPE] Error creating Stripe payment intent:', error);
            console.error('❌ [STRIPE] Error message:', error?.message);
            console.error('❌ [STRIPE] Error type:', error?.type);
            console.error('❌ [STRIPE] Error code:', error?.code);
            throw new Error(`Failed to create payment intent: ${error?.message || 'Unknown error'}`);
        }
    }

    /**
     * Create pending Zelle transaction
     * @param transaction - Transaction data
     * @param transactionId - Transaction ID
     * @returns Zelle instructions
     */
    private async createZelleTransaction(
        transaction: Partial<PaymentTransaction>,
        transactionId: string
    ): Promise<PaymentIntentResponse> {
        try {
            // Get Zelle configuration from environment
            const zelleRecipientEmail = process.env.ZELLE_RECIPIENT_EMAIL || '';
            const zelleRecipientPhone = process.env.ZELLE_RECIPIENT_PHONE || '';

            if (!zelleRecipientEmail || !zelleRecipientPhone) {
                throw new Error('Zelle configuration not found');
            }

            // Create Zelle instructions
            const instructions: ZelleInstructions = {
                recipientEmail: zelleRecipientEmail,
                recipientPhone: zelleRecipientPhone,
                amount: transaction.amount!,
                currency: transaction.currency!,
                memo: `${transaction.metadata!.eventTitle} - Transaction #${transactionId}`,
                instructions: [
                    'Open your banking app or Zelle app',
                    'Select "Send Money"',
                    `Enter recipient: ${zelleRecipientEmail}`,
                    `Amount: $${(transaction.amount! / 100).toFixed(2)}`,
                    `Memo: ${transaction.metadata!.eventTitle} - Transaction #${transactionId}`,
                    'Complete the transfer',
                    'Your registration will be confirmed within 24 hours'
                ]
            };

            // Add Zelle instructions to transaction
            transaction.zelleInstructions = instructions;
            transaction.status = 'pending';

            // Save transaction
            await this.db
                .collection('payment_transactions')
                .doc(transactionId)
                .set(transaction as PaymentTransaction);

            // Mark attendees as waiting_for_approval (manual admin verification)
            if (transaction.metadata?.paidAttendees && transaction.eventId) {
                const batch = this.db.batch();
                for (const attendee of transaction.metadata.paidAttendees) {
                    const attendeeRef = this.db
                        .collection('events')
                        .doc(transaction.eventId)
                        .collection('attendees')
                        .doc(attendee.attendeeId);
                    batch.update(attendeeRef, {
                        paymentStatus: 'waiting_for_approval',
                        paymentTransactionId: transactionId,
                        updatedAt: Timestamp.now()
                    });
                }
                await batch.commit();
            }

            return {
                instructions,
                transactionId,
                amount: transaction.amount!,
                currency: transaction.currency!
            };
        } catch (error) {
            console.error('Error creating Zelle transaction:', error);
            throw new Error('Failed to create Zelle transaction');
        }
    }

    /**
     * Get transaction by ID
     * @param transactionId - Transaction ID
     * @returns Transaction data or null
     */
    async getTransaction(transactionId: string): Promise<PaymentTransaction | null> {
        const transactionDoc = await this.db
            .collection('payment_transactions')
            .doc(transactionId)
            .get();

        if (!transactionDoc.exists) {
            return null;
        }

        return transactionDoc.data() as PaymentTransaction;
    }

    /**
     * Update transaction status
     * @param transactionId - Transaction ID
     * @param status - New status
     */
    async updateTransactionStatus(
        transactionId: string,
        status: string
    ): Promise<void> {
        await this.db
            .collection('payment_transactions')
            .doc(transactionId)
            .update({
                status,
                updatedAt: Timestamp.now(),
                ...(status === 'paid' && { paidAt: Timestamp.now() })
            });
    }
}
