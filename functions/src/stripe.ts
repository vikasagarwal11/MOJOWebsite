/**
 * Stripe Payment Integration for RSVP System
 * 
 * This module provides secure server-side Stripe integration with:
 * - Payment Intent creation for attendee payments
 * - Incremental charging for newly added attendees
 * - Webhook handling for payment confirmations
 * - Idempotent operations to prevent duplicate charges
 */

import * as admin from 'firebase-admin';
import { CallableRequest, HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import Stripe from 'stripe';

const db = admin.firestore();

/**
 * Stripe fee configuration
 */
const STRIPE_FEE_PERCENTAGE = 0.029; // 2.9%
const STRIPE_FEE_FIXED_CENTS = 30; // $0.30
const STRIPE_FEE_MULTIPLIER = 1 - STRIPE_FEE_PERCENTAGE; // 0.971

/**
 * Calculate the total charge amount that includes Stripe fees
 * 
 * CRITICAL: This is the GOLDEN RULE for Stripe fee calculation.
 * Stripe fees are applied ONCE at the transaction level, NEVER per item.
 * 
 * @param netTotalCents - The net amount the admin wants to receive (in cents)
 * @returns The amount to charge the user (in cents)
 */
function calculateChargeAmount(netTotalCents: number): number {
  if (netTotalCents <= 0) return 0;
  
  // Formula: chargeAmount = (netTotal + 0.30) / 0.971
  const chargeAmount = (netTotalCents + STRIPE_FEE_FIXED_CENTS) / STRIPE_FEE_MULTIPLIER;
  
  // Round to nearest cent
  return Math.round(chargeAmount);
}

// Lazy initialization of Stripe to avoid errors during deployment analysis
let stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripe) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    console.log('🔑 Stripe Key Check:', {
      hasEnvVar: !!stripeSecretKey,
      keyPrefix: stripeSecretKey ? stripeSecretKey.substring(0, 7) + '...' : 'MISSING'
    });
    
    if (!stripeSecretKey) {
      console.error('❌ STRIPE_SECRET_KEY not found in environment variables');
      console.error('Available env vars:', Object.keys(process.env).filter(k => !k.includes('SECRET')));
      throw new Error('STRIPE_SECRET_KEY is required. Add it to functions/.env file');
    }
    
    stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-12-15.clover',
      typescript: true,
    });
    
    console.log('✅ Stripe initialized successfully');
  }
  return stripe;
}

/**
 * Interface for Payment Intent creation request
 */
interface CreatePaymentIntentRequest {
  eventId: string;
  userId: string;
  attendeeIds: string[]; // IDs of attendees to pay for
  metadata?: Record<string, string>;
}

/**
 * Interface for Payment Intent response
 */
interface CreatePaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  transactionId: string;
}

/**
 * Calculate the incremental amount to charge for new attendees
 * 
 * This function:
 * 1. Gets all attendees for the event and user
 * 2. Identifies which attendees have already been paid for
 * 3. Calculates the price only for unpaid attendees
 * 4. Returns the incremental amount to charge
 */
async function calculateIncrementalAmount(
  eventId: string,
  userId: string,
  attendeeIds: string[]
): Promise<{
  totalAmount: number;
  currency: string;
  unpaidAttendees: Array<{
    attendeeId: string;
    name: string;
    ageGroup: string;
    price: number;
  }>;
  alreadyPaidAttendees: Array<{
    attendeeId: string;
    name: string;
  }>;
}> {
  console.log('📊 Calculating incremental amount', {
    eventId,
    userId,
    attendeeIds,
  });

  // Get event pricing information
  const eventDoc = await db.collection('events').doc(eventId).get();
  if (!eventDoc.exists) {
    throw new HttpsError('not-found', 'Event not found');
  }

  const eventData = eventDoc.data();
  const pricing = eventData?.pricing;

  if (!pricing || (!pricing.requiresPayment && !pricing.eventSupportAmount)) {
    throw new HttpsError(
      'failed-precondition',
      'Event does not require payment'
    );
  }

  const currency = pricing.currency || 'usd';

  // Get all attendees for this user and event from the subcollection
  console.log('🔍 Querying attendees with:', { eventId, userId, rsvpStatus: 'going' });
  
  const attendeesSnapshot = await db
    .collection('events')
    .doc(eventId)
    .collection('attendees')
    .where('userId', '==', userId)
    .where('rsvpStatus', '==', 'going')
    .get();

  console.log('📋 Raw query returned:', attendeesSnapshot.docs.length, 'documents');
  
  // Also check if ANY attendees exist for this event with requested IDs
  const requestedAttendeesSnapshot = await db
    .collection('events')
    .doc(eventId)
    .collection('attendees')
    .get();
  
  console.log('📋 Total attendees for event:', requestedAttendeesSnapshot.docs.length);
  requestedAttendeesSnapshot.docs.forEach(doc => {
    const data = doc.data();
    if (attendeeIds.includes(doc.id)) {
      console.log('🎯 Found requested attendee:', doc.id, {
        userId: data.userId,
        rsvpStatus: data.rsvpStatus,
        paymentStatus: data.paymentStatus,
        name: data.name
      });
    }
  });

  const allAttendees = attendeesSnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      attendeeId: doc.id,
      name: data.name || '',
      ageGroup: data.ageGroup || 'adult',
      paymentStatus: data.paymentStatus || 'unpaid',
      rsvpStatus: data.rsvpStatus || 'going',
      userId: data.userId || '',
      eventId: data.eventId || '',
    };
  });

  console.log('👥 All attendees found:', allAttendees.length);

  const unpaidAttendees: Array<{
    attendeeId: string;
    name: string;
    ageGroup: string;
    price: number;
  }> = [];
  const alreadyPaidAttendees: Array<{
    attendeeId: string;
    name: string;
  }> = [];

  // Categorize attendees into paid and unpaid
  for (const attendee of allAttendees) {
    // Only process attendees that were requested
    if (!attendeeIds.includes(attendee.attendeeId)) {
      continue;
    }

    // Check if attendee has already been paid for
    if (attendee.paymentStatus === 'paid') {
      console.log(`✅ Attendee ${attendee.name} already paid - skipping`);
      alreadyPaidAttendees.push({
        attendeeId: attendee.attendeeId,
        name: attendee.name,
      });
      continue;
    }

    // Calculate price for this attendee
    const price = calculateAttendeePrice(attendee.ageGroup, pricing);
    console.log(`💰 Attendee ${attendee.name} price: $${(price / 100).toFixed(2)}`);

    unpaidAttendees.push({
      attendeeId: attendee.attendeeId,
      name: attendee.name,
      ageGroup: attendee.ageGroup,
      price,
    });
  }

  // Calculate total amount for unpaid attendees (NET amounts)
  let netTotal = unpaidAttendees.reduce((sum, att) => sum + att.price, 0);

  // Add event support amount per unpaid attendee if applicable (NET amount)
  if (pricing.eventSupportAmount && pricing.eventSupportAmount > 0) {
    const eventSupportTotal = pricing.eventSupportAmount * unpaidAttendees.length;
    console.log(
      `🎗️ Adding event support: ${unpaidAttendees.length} × $${(pricing.eventSupportAmount / 100).toFixed(2)} = $${(eventSupportTotal / 100).toFixed(2)}`
    );
    netTotal += eventSupportTotal;
  }

  console.log(`📊 Net total (admin receives): $${(netTotal / 100).toFixed(2)}`);
  
  // Check if this is a Zelle payment (no Stripe fees)
  const isZellePayment = pricing.paymentMethod === 'zelle';
  
  let totalAmount: number;
  if (isZellePayment) {
    // For Zelle payments, charge the exact NET amount (no Stripe fees)
    totalAmount = netTotal;
    console.log(`💵 Zelle payment - using NET amount: $${(totalAmount / 100).toFixed(2)}`);
  } else {
    // For Stripe payments, apply Stripe fees
    totalAmount = calculateChargeAmount(netTotal);
    console.log(`💳 Stripe payment - charge total (includes fees): $${(totalAmount / 100).toFixed(2)}`);
    console.log(`📊 Stripe fee: $${((totalAmount - netTotal) / 100).toFixed(2)}`);
  }
  return {
    totalAmount,
    currency,
    unpaidAttendees,
    alreadyPaidAttendees,
  };
}

/**
 * Calculate price for a specific attendee based on age group
 * 
 * NOTE: This returns the NET price (what admin receives).
 * The frontend PaymentService applies Stripe fees proportionally
 * and sends the CHARGE amount to this function.
 */
function calculateAttendeePrice(
  ageGroup: string,
  pricing: any
): number {
  if (pricing.isFree || !pricing.requiresPayment) {
    return 0;
  }

  // Find specific age group pricing (NET amount)
  const ageGroupPricing = pricing.ageGroupPricing?.find(
    (p: any) => p.ageGroup === ageGroup
  );

  if (ageGroupPricing) {
    return ageGroupPricing.price; // NET price
  }

  // Fallback to adult price (NET)
  return pricing.adultPrice || 0;
}

/**
 * Create a Stripe Payment Intent for RSVP payment
 * 
 * This function implements the incremental payment logic:
 * 1. Checks which attendees have already been paid for
 * 2. Calculates the amount only for new/unpaid attendees
 * 3. Creates a Payment Intent with Stripe
 * 4. Creates a transaction record in Firestore
 * 
 * The function is idempotent - if called multiple times with the same
 * attendees, it will only charge for unpaid attendees.
 */
export const createPaymentIntent = onCall(
  { region: 'us-east1' },
  async (
    request: CallableRequest<CreatePaymentIntentRequest>
  ): Promise<CreatePaymentIntentResponse> => {
    console.log('🎫 createPaymentIntent called');
    console.log('🔧 Auth:', request.auth ? 'authenticated' : 'NOT authenticated');
    console.log('🔧 Data:', JSON.stringify(request.data));
    
    try {
      // Verify authentication
      if (!request.auth) {
        console.error('❌ No auth token');
        throw new HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const { eventId, userId, attendeeIds, metadata = {} } = request.data;

      console.log('🔧 Request params:', { eventId, userId, attendeeIds });

      // Verify the user is authorized to pay for these attendees
      if (request.auth.uid !== userId) {
        console.error('❌ User ID mismatch:', { authUid: request.auth.uid, userId });
        throw new HttpsError(
          'permission-denied',
          'User can only create payment intents for their own attendees'
        );
      }

      console.log('🎫 Creating Payment Intent', {
        eventId,
        userId,
        attendeeIds,
      });

      console.log('🔧 Initializing Stripe...');
      const stripeInstance = getStripe();
      console.log('✅ Stripe initialized');

      // Calculate incremental amount
      const {
        totalAmount,
        currency,
        unpaidAttendees,
        alreadyPaidAttendees,
      } = await calculateIncrementalAmount(eventId, userId, attendeeIds);

      // If no unpaid attendees, return error
      if (unpaidAttendees.length === 0) {
        console.log('⚠️ No unpaid attendees found');
        throw new HttpsError(
          'failed-precondition',
          'All attendees have already been paid for. Please refresh the page.',
          {
            alreadyPaid: alreadyPaidAttendees.map((a) => a.name),
          }
        );
      }

      // If amount is zero or negative, don't create payment intent
      if (totalAmount <= 0) {
        console.log('⚠️ Invalid payment amount:', totalAmount);
        throw new HttpsError(
          'failed-precondition',
          'Payment amount must be greater than zero. Minimum payment is $0.50.',
          {
            amount: totalAmount,
            currency
          }
        );
      }
      
      // Stripe minimum is 50 cents for USD
      const minimumAmount = currency.toLowerCase() === 'usd' ? 50 : 100;
      if (totalAmount < minimumAmount) {
        console.log('⚠️ Payment amount below minimum:', { totalAmount, minimumAmount, currency });
        throw new HttpsError(
          'failed-precondition',
          `Payment amount must be at least $${(minimumAmount / 100).toFixed(2)} ${currency.toUpperCase()}.`,
          {
            amount: totalAmount,
            minimum: minimumAmount,
            currency
          }
        );
      }

      // Create transaction record first (for idempotency tracking)
      const transactionRef = db.collection('payment_transactions').doc();
      const transactionData = {
        eventId,
        userId,
        attendeeId: unpaidAttendees[0].attendeeId,
        amount: totalAmount,
        currency,
        status: 'pending',
        method: 'card',
        refundStatus: 'none',
        metadata: {
          attendeeName: unpaidAttendees[0].name,
          ageGroup: unpaidAttendees[0].ageGroup,
          eventTitle: '',
          eventDate: '',
          totalAttendees: unpaidAttendees.length,
          breakdown: unpaidAttendees.map((att) => ({
            attendeeId: att.attendeeId,
            attendeeName: att.name,
            ageGroup: att.ageGroup,
            price: att.price,
            quantity: 1,
            subtotal: att.price,
          })),
          paidAttendees: unpaidAttendees.map((att) => ({
            attendeeId: att.attendeeId,
            name: att.name,
            ageGroup: att.ageGroup,
            amount: att.price,
          })),
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await transactionRef.set(transactionData);
      console.log('💾 Transaction record created:', transactionRef.id);

      // Create Stripe Payment Intent with unique idempotency key per transaction
      // Using transaction ID ensures each payment attempt is unique
      const idempotencyKey = `payment-${transactionRef.id}-${totalAmount}`;
      console.log('🔑 Using idempotency key:', idempotencyKey);

      const paymentIntent = await getStripe().paymentIntents.create(
        {
          amount: totalAmount,
          currency,
          metadata: {
            eventId,
            userId,
            transactionId: transactionRef.id,
            attendeeIds: attendeeIds.join(','),
            attendeeNames: unpaidAttendees.map(a => a.name).join(', '),
            ...metadata,
          },
          description: `Payment for ${unpaidAttendees.length} attendee${unpaidAttendees.length > 1 ? 's' : ''}`,
        },
        {
          // Unique idempotency key per transaction to prevent parameter mismatch errors
          idempotencyKey,
        }
      );

      console.log('✅ Payment Intent created:', paymentIntent.id);

      // Update transaction with Payment Intent ID
      await transactionRef.update({
        stripePaymentIntentId: paymentIntent.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        clientSecret: paymentIntent.client_secret!,
        paymentIntentId: paymentIntent.id,
        amount: totalAmount,
        currency,
        transactionId: transactionRef.id,
      };
    } catch (error: any) {
      console.error('❌ Error creating payment intent:', error);
      console.error('Error details:', {
        type: typeof error,
        constructor: error?.constructor?.name,
        message: error?.message,
        code: error?.code,
        stripeType: error?.type,
      });
      
      // Re-throw HttpsError as-is
      if (error instanceof HttpsError) {
        throw error;
      }

      // Stripe-specific errors with user-friendly messages
      if (error.type && error.type.startsWith('Stripe')) {
        let userMessage = 'Payment processing error. Please try again.';
        
        // Provide specific guidance for common errors
        if (error.code === 'idempotency_key_in_use') {
          userMessage = 'A payment request is already being processed. Please wait a moment and refresh the page.';
        } else if (error.code === 'amount_too_small') {
          userMessage = 'Payment amount is too small. Minimum is $0.50.';
        } else if (error.message) {
          userMessage = error.message;
        }
        
        throw new HttpsError(
          'internal',
          userMessage,
          { stripeError: error.type, code: error.code }
        );
      }

      // Wrap other errors with user-friendly message
      throw new HttpsError(
        'internal',
        'Unable to process payment. Please try again or contact support if the issue persists.',
        { 
          errorType: error?.constructor?.name,
          originalMessage: error?.message 
        }
      );
    }
  }
);

/**
 * Handle Stripe webhook events
 * 
 * This endpoint receives webhook notifications from Stripe and:
 * 1. Verifies the webhook signature for security
 * 2. Handles payment success events
 * 3. Updates transaction and attendee records
 * 4. Handles payment failures
 */
export const stripeWebhook = onRequest(
  { region: 'us-east1' },
  async (req, res) => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    console.error('❌ No stripe-signature header found');
    res.status(400).send('Missing stripe-signature header');
    return;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('❌ STRIPE_WEBHOOK_SECRET not configured');
    res.status(500).send('Webhook secret not configured');
    return;
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = getStripe().webhooks.constructEvent(
      req.rawBody,
      sig,
      webhookSecret
    );
    console.log('✅ Webhook signature verified:', event.type);
  } catch (err: any) {
    console.error('❌ Webhook signature verification failed:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    // Handle different event types
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailure(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.canceled':
        await handlePaymentCanceled(event.data.object as Stripe.PaymentIntent);
        break;

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('❌ Error processing webhook:', error);
    res.status(500).send(`Webhook processing error: ${error.message}`);
  }
});

/**
 * Handle successful payment
 */
async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  console.log('✅ Payment succeeded:', paymentIntent.id);

  const transactionId = paymentIntent.metadata.transactionId;
  if (!transactionId) {
    console.error('❌ No transaction ID in payment intent metadata');
    return;
  }

  // Get transaction to check if already processed (idempotency)
  const transactionRef = db.collection('payment_transactions').doc(transactionId);
  const transactionDoc = await transactionRef.get();
  
  if (!transactionDoc.exists) {
    console.error('❌ Transaction not found:', transactionId);
    return;
  }
  
  const transactionData = transactionDoc.data();
  
  // Idempotency check - if already paid, skip processing
  if (transactionData?.status === 'paid') {
    console.log('⚠️ Transaction', transactionId, 'already marked as paid. Skipping duplicate processing.');
    return;
  }

  const batch = db.batch();

  // Update transaction status
  batch.update(transactionRef, {
    status: 'paid',
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId: paymentIntent.latest_charge,
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Get transaction data to update attendees
  if (transactionData?.metadata?.paidAttendees && transactionData?.eventId) {
    const eventId = transactionData.eventId;
    const userId = transactionData.userId;
    console.log(`💳 Processing payment for ${transactionData.metadata.paidAttendees.length} attendee(s) in event ${eventId}`);
    
    // Update each attendee's payment status in the CORRECT subcollection
    for (const attendee of transactionData.metadata.paidAttendees) {
      const attendeeRef = db.collection('events').doc(eventId).collection('attendees').doc(attendee.attendeeId);
      batch.update(attendeeRef, {
        paymentStatus: 'paid',
        paymentTransactionId: transactionId,
        price: attendee.amount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`✅ Marking attendee ${attendee.name} (${attendee.attendeeId}) as paid`);
    }
  } else {
    console.warn('⚠️ No attendee data found in transaction metadata');
  }

  await batch.commit();
  console.log('✅ Payment success processing completed for transaction:', transactionId);
}

/**
 * Handle failed payment
 */
async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
  console.log('❌ Payment failed:', paymentIntent.id);

  const transactionId = paymentIntent.metadata.transactionId;
  if (!transactionId) {
    console.error('❌ No transaction ID in payment intent metadata');
    return;
  }

  // Update transaction status
  await db.collection('payment_transactions').doc(transactionId).update({
    status: 'failed',
    stripePaymentIntentId: paymentIntent.id,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log('✅ Payment failure processing completed');
}

/**
 * Handle canceled payment
 */
async function handlePaymentCanceled(paymentIntent: Stripe.PaymentIntent) {
  console.log('🚫 Payment canceled:', paymentIntent.id);

  const transactionId = paymentIntent.metadata.transactionId;
  if (!transactionId) {
    console.error('❌ No transaction ID in payment intent metadata');
    return;
  }

  // Update transaction status
  await db.collection('payment_transactions').doc(transactionId).update({
    status: 'failed',
    stripePaymentIntentId: paymentIntent.id,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log('✅ Payment cancellation processing completed');
}
