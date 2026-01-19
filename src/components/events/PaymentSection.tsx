import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { CheckCircle, ChevronDown, CreditCard, DollarSign, Loader2, Users, XCircle } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { EventDoc } from '../../hooks/useEvents';
import { PaymentService } from '../../services/paymentService';
import { Attendee } from '../../types/attendee';
import { PaymentStatusAnimation } from './PaymentStatusAnimation';

// Initialize Stripe - load publishable key from environment
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

/**
 * Poll Firestore to check if payment status has been updated by webhook
 * This ensures we wait for the webhook to process before showing success
 */
const pollPaymentStatus = async (
  eventId: string,
  attendeeIds: string[],
  maxAttempts = 10,
  delayMs = 500
): Promise<boolean> => {
  console.log('🔍 [POLL] Starting payment status polling');
  console.log('🔍 [POLL] Event ID:', eventId);
  console.log('🔍 [POLL] Attendee IDs:', attendeeIds);
  console.log('🔍 [POLL] Will poll', maxAttempts, 'times with', delayMs, 'ms delay');
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`📊 [POLL] Attempt ${attempt}/${maxAttempts}`);
    
    try {
      // Check all attendees
      const statusChecks = await Promise.all(
        attendeeIds.map(async (attendeeId) => {
          const attendeeRef = doc(db, 'events', eventId, 'attendees', attendeeId);
          console.log(`  🔍 [POLL] Checking attendee path: events/${eventId}/attendees/${attendeeId}`);
          const attendeeDoc = await getDoc(attendeeRef);
          
          if (!attendeeDoc.exists()) {
            console.warn(`  ⚠️ [POLL] Attendee ${attendeeId} does NOT exist in Firestore!`);
            return { attendeeId, status: 'NOT_FOUND', isPaid: false };
          }
          
          const data = attendeeDoc.data();
          const paymentStatus = data?.paymentStatus;
          console.log(`  📋 [POLL] Attendee ${attendeeId} status:`, paymentStatus);
          console.log(`  📋 [POLL] Full attendee data:`, JSON.stringify(data, null, 2));
          
          return { attendeeId, status: paymentStatus, isPaid: paymentStatus === 'paid' };
        })
      );
      
      console.log('📊 [POLL] Status check results:', statusChecks);
      
      if (statusChecks.every(check => check.isPaid)) {
        console.log('✅ [POLL] SUCCESS! All attendees marked as paid in Firestore!');
        return true;
      }
      
      const unpaidCount = statusChecks.filter(check => !check.isPaid).length;
      console.log(`⏳ [POLL] Still waiting: ${unpaidCount} attendees not paid yet`);
      
      // Wait before next poll
      if (attempt < maxAttempts) {
        console.log(`⏳ [POLL] Waiting ${delayMs}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error('❌ [POLL] Error polling payment status:', error);
      console.error('❌ [POLL] Error details:', error);
    }
  }
  
  console.warn('⚠️ [POLL] TIMEOUT! Payment status polling timed out after', maxAttempts, 'attempts');
  console.warn('⚠️ [POLL] Webhook may still be processing or there may be an issue');
  return false;
};

interface PaymentSectionProps {
  event: EventDoc;
  attendees: Attendee[];
  onPaymentComplete?: () => void;
  onPaymentError?: (error: string) => void;
}

interface PaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  transactionId: string;
}

/**
 * Payment Form Component using Stripe Elements
 * This component handles the actual payment processing
 */
const PaymentForm: React.FC<{
  amount: number;
  currency: string;
  unpaidAttendees: Attendee[];
  onSuccess: () => Promise<void>;
  onError: (error: string) => void;
  onCancel: () => void;
}> = ({ amount, currency, unpaidAttendees, onSuccess, onError, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('Processing payment...');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      onError('Payment system not initialized. Please refresh the page.');
      return;
    }

    if (amount <= 0) {
      onError('Invalid payment amount. Please refresh the page.');
      return;
    }

    setIsProcessing(true);
    setProcessingMessage('Securely processing your payment...');

    try {
      console.log('💳 Confirming payment with Stripe...');
      
      setProcessingMessage('Verifying payment details...');
      
      // Confirm the payment with Stripe
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href, // Redirect back to current page
        },
        redirect: 'if_required', // Only redirect if 3D Secure is required
      });

      if (error) {
        console.error('❌ Payment error:', error);
        
        // Provide user-friendly error messages
        let errorMessage = 'Payment failed. Please try again.';
        if (error.type === 'card_error') {
          errorMessage = error.message || 'Your card was declined. Please try a different card.';
        } else if (error.type === 'validation_error') {
          errorMessage = 'Please check your card details and try again.';
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        onError(errorMessage);
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        console.log('✅ Payment succeeded:', paymentIntent.id);
        setProcessingMessage('Payment successful! 🎉');
        // Small delay to show success message before closing
        await new Promise(resolve => setTimeout(resolve, 500));
        await onSuccess();
      } else if (paymentIntent && paymentIntent.status === 'processing') {
        console.log('⏳ Payment is processing:', paymentIntent.id);
        onError('Payment is being processed. Please wait a moment and check back.');
      } else if (paymentIntent && paymentIntent.status === 'requires_payment_method') {
        console.log('⚠️ Payment requires payment method:', paymentIntent.id);
        onError('Payment failed. Please try a different payment method.');
      } else {
        console.log('⚠️ Unexpected payment status:', paymentIntent?.status);
        onError('Payment not completed. Please try again or contact support.');
      }
    } catch (err: any) {
      console.error('❌ Payment processing error:', err);
      onError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm mx-4 text-center">
            <div className="relative mb-4">
              <div className="w-20 h-20 mx-auto">
                <svg className="animate-spin" viewBox="0 0 50 50">
                  <circle
                    className="stroke-gray-200"
                    cx="25"
                    cy="25"
                    r="20"
                    fill="none"
                    strokeWidth="4"
                  />
                  <circle
                    className="stroke-green-600"
                    cx="25"
                    cy="25"
                    r="20"
                    fill="none"
                    strokeWidth="4"
                    strokeDasharray="80, 200"
                    strokeDashoffset="0"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Processing Payment</h3>
            <p className="text-gray-600 animate-pulse">{processingMessage}</p>
            <div className="mt-4 flex justify-center gap-1">
              <div className="w-2 h-2 bg-green-600 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
              <div className="w-2 h-2 bg-green-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
              <div className="w-2 h-2 bg-green-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
            </div>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-blue-900">Amount to Pay</span>
          <span className="text-lg font-bold text-blue-600">
            ${(amount / 100).toFixed(2)} {currency.toUpperCase()}
          </span>
        </div>
        <p className="text-xs text-blue-700">
          Payment for {unpaidAttendees.length} attendee{unpaidAttendees.length !== 1 ? 's' : ''}
        </p>
      </div>

      <PaymentElement />

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || isProcessing}
          className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              Pay ${(amount / 100).toFixed(2)}
            </>
          )}
        </button>
      </div>

      <p className="text-xs text-gray-500 text-center">
        Your payment is secured by Stripe. We never store your card details.
      </p>
    </form>
  );
};

/**
 * Main Payment Section Component
 * Handles payment summary display and payment flow orchestration
 */
export const PaymentSection: React.FC<PaymentSectionProps> = ({
  event,
  attendees,
  onPaymentComplete,
  onPaymentError,
}) => {
  const { currentUser } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [lastPaymentAttempt, setLastPaymentAttempt] = useState<number>(0);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [showErrorAnimation, setShowErrorAnimation] = useState(false);
  const [animationAmount, setAnimationAmount] = useState<number>(0);

  // Calculate payment summary directly in useMemo to prevent flash
  // Only calculate for UNPAID attendees to avoid charging for already-paid ones
  const paymentSummary = useMemo(() => {
    if (!event.pricing) return null;
    
    // Filter to only unpaid going attendees BEFORE calculating
    const unpaidGoingAttendees = attendees.filter(
      a => a.rsvpStatus === 'going' && a.paymentStatus !== 'paid'
    );
    
    if (unpaidGoingAttendees.length === 0) {
      return {
        totalAmount: 0,
        currency: event.pricing.currency || 'USD',
        breakdown: [],
        status: 'unpaid' as const,
        canRefund: false
      };
    }
    
    return PaymentService.calculatePaymentSummary(unpaidGoingAttendees, event.pricing);
  }, [attendees, event.pricing]);

  // Update payment success state when attendees change
  useEffect(() => {
    const goingAttendees = attendees.filter(a => a.rsvpStatus === 'going');
    const allPaid = goingAttendees.length > 0 && goingAttendees.every(a => a.paymentStatus === 'paid');
    
    if (allPaid) {
      setPaymentSuccess(true);
      setPaymentError(null);
      setShowPaymentForm(false);
      setClientSecret(null);
    } else {
      setPaymentSuccess(false);
    }
  }, [attendees]);

  const goingAttendees = useMemo(() => 
    attendees.filter(attendee => attendee.rsvpStatus === 'going'),
    [attendees]
  );

  const unpaidAttendees = useMemo(() => 
    goingAttendees.filter(attendee => attendee.paymentStatus !== 'paid'),
    [goingAttendees]
  );

  const paidAttendees = useMemo(() => 
    goingAttendees.filter(attendee => attendee.paymentStatus === 'paid'),
    [goingAttendees]
  );

  // Calculate summary for paid attendees to show their amounts
  const paidSummary = useMemo(() => {
    if (!event.pricing || paidAttendees.length === 0) return null;
    return PaymentService.calculatePaymentSummary(paidAttendees, event.pricing);
  }, [paidAttendees, event.pricing]);

  const hasPaymentRequired = useMemo(() => {
    const hasEventSupportAmount = event.pricing?.eventSupportAmount && event.pricing.eventSupportAmount > 0;
    const hasTicketPrice = event.pricing?.requiresPayment && !event.pricing?.isFree;
    return hasTicketPrice || hasEventSupportAmount;
  }, [event.pricing]);

  const hasUnpaidAmount = useMemo(() => {
    if (!paymentSummary) return false;
    
    // Calculate amount for unpaid attendees only (event support already in breakdown)
    const unpaidAmount = unpaidAttendees.reduce((sum, attendee) => {
      const breakdownItem = paymentSummary.breakdown.find(b => b.attendeeId === attendee.attendeeId);
      return sum + (breakdownItem?.subtotal || 0);
    }, 0);
    
    return unpaidAmount > 0;
  }, [paymentSummary, unpaidAttendees]);

  const handlePayNow = async () => {
    if (!currentUser) {
      setPaymentError('You must be logged in to make a payment');
      return;
    }

    if (unpaidAttendees.length === 0) {
      setPaymentError('All attendees have already been paid for');
      return;
    }

    // Prevent rapid successive payment attempts (debounce)
    const now = Date.now();
    if (now - lastPaymentAttempt < 2000) {
      console.log('⚠️ Payment attempt too soon, ignoring');
      return;
    }
    setLastPaymentAttempt(now);

    setIsCreatingIntent(true);
    setPaymentError(null);
    setPaymentSuccess(false); // Reset success state

    try {
      const functions = getFunctions();
      const createPaymentIntentFn = httpsCallable<
        { eventId: string; userId: string; attendeeIds: string[] },
        PaymentIntentResponse
      >(functions, 'createPaymentIntent');

      console.log('🔄 Creating payment intent for', unpaidAttendees.length, 'attendee(s)');
      
      const result = await createPaymentIntentFn({
        eventId: event.id,
        userId: currentUser.id,
        attendeeIds: unpaidAttendees.map(a => a.attendeeId),
      });

      console.log('✅ Payment intent created successfully');
      setClientSecret(result.data.clientSecret);
      setShowPaymentForm(true);
      setIsExpanded(true);
    } catch (error: any) {
      console.error('❌ Error creating payment intent:', error);
      
      // Extract user-friendly error message
      let errorMessage = 'Unable to process payment. Please try again.';
      
      if (error.code === 'failed-precondition' && error.message.includes('already been paid')) {
        errorMessage = 'All selected attendees have already been paid for. Please refresh the page.';
      } else if (error.message && typeof error.message === 'string') {
        // Use the error message from the backend if available
        errorMessage = error.message;
      } else if (error.details?.message) {
        errorMessage = error.details.message;
      }
      
      console.error('📝 User-facing error:', errorMessage);
      setPaymentError(errorMessage);
      onPaymentError?.(errorMessage);
    } finally {
      setIsCreatingIntent(false);
    }
  };

  const handlePaymentSuccess = async () => {
    console.log('✅ ========== PAYMENT SUCCESS HANDLER STARTED ==========');
    console.log('✅ [SUCCESS] Payment successful - updating UI state');
    console.log('✅ [SUCCESS] Event ID:', event.id);
    console.log('✅ [SUCCESS] Unpaid attendees:', unpaidAttendees.map(a => ({ id: a.attendeeId, name: a.name })));
    
    // Calculate the total amount paid for animation (event support already in breakdown)
    const totalPaid = unpaidAttendees.reduce((sum, attendee) => {
      const breakdownItem = paymentSummary?.breakdown.find(b => b.attendeeId === attendee.attendeeId);
      return sum + (breakdownItem?.subtotal || 0);
    }, 0);
    
    console.log('✅ [SUCCESS] Total amount paid:', totalPaid);
    
    setAnimationAmount(totalPaid);
    setPaymentError(null); // Clear any previous errors
    
    // Poll Firestore to wait for webhook to update payment status
    console.log('⏳ [SUCCESS] Waiting for webhook to process payment status...');
    const attendeeIds = unpaidAttendees.map(a => a.attendeeId);
    console.log('⏳ [SUCCESS] Will poll for these attendee IDs:', attendeeIds);
    
    const statusUpdated = await pollPaymentStatus(event.id, attendeeIds, 15, 500); // 15 attempts x 500ms = 7.5s max
    
    if (statusUpdated) {
      console.log('✅ [SUCCESS] Payment status confirmed in database - proceeding with animation');
    } else {
      console.warn('⚠️ [SUCCESS] Proceeding without confirmation - status may update shortly');
    }
    
    // Show success animation
    console.log('🎉 [SUCCESS] Showing success animation');
    setShowSuccessAnimation(true);
    setPaymentSuccess(true);
    setShowPaymentForm(false);
    setClientSecret(null);
    
    // Trigger refresh to update UI
    console.log('🔄 [SUCCESS] Calling onPaymentComplete callback to refresh attendees');
    console.log('🔄 [SUCCESS] onPaymentComplete exists?', !!onPaymentComplete);
    
    if (onPaymentComplete) {
      try {
        await onPaymentComplete();
        console.log('✅ [SUCCESS] onPaymentComplete callback completed successfully');
      } catch (error) {
        console.error('❌ [SUCCESS] Error in onPaymentComplete callback:', error);
      }
    } else {
      console.warn('⚠️ [SUCCESS] No onPaymentComplete callback provided!');
    }
    
    console.log('✅ ========== PAYMENT SUCCESS HANDLER COMPLETED ==========');
  };

  const handlePaymentError = (error: string) => {
    console.error('❌ Payment error:', error);
    
    // Calculate the attempted amount for animation (event support already in breakdown)
    const attemptedAmount = unpaidAttendees.reduce((sum, attendee) => {
      const breakdownItem = paymentSummary?.breakdown.find(b => b.attendeeId === attendee.attendeeId);
      return sum + (breakdownItem?.subtotal || 0);
    }, 0);
    
    setAnimationAmount(attemptedAmount);
    setShowErrorAnimation(true);
    setPaymentError(error);
    setPaymentSuccess(false); // Clear success state
    onPaymentError?.(error);
  };

  const handleCancelPayment = () => {
    console.log('🚫 Payment cancelled by user');
    setShowPaymentForm(false);
    setClientSecret(null);
    setPaymentError(null);
    setPaymentSuccess(false);
  };

  if (!event.pricing || !hasPaymentRequired) {
    return null; // Don't show payment section for free events
  }

  return (
    <>
      {/* Success Animation Modal */}
      {showSuccessAnimation && (
        <PaymentStatusAnimation
          status="success"
          amount={animationAmount}
          currency={event.pricing?.currency || 'USD'}
          onClose={() => {
            setShowSuccessAnimation(false);
            // Refresh one more time when animation closes to ensure UI is fully updated
            console.log('🔄 Final refresh after animation close');
            onPaymentComplete?.();
          }}
          autoCloseDelay={5000} // Auto close after 5 seconds
        />
      )}

      {/* Error Animation Modal */}
      {showErrorAnimation && (
        <PaymentStatusAnimation
          status="error"
          amount={animationAmount}
          currency={event.pricing?.currency || 'USD'}
          onClose={() => setShowErrorAnimation(false)}
          autoCloseDelay={0} // Manual close only for errors
        />
      )}

      <div className="bg-white border border-gray-200 rounded-lg mb-3 sm:mb-4 overflow-hidden">
      {/* Clickable Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-200 transition-colors ${
          paymentSuccess
            ? 'bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100'
            : hasUnpaidAmount
            ? 'bg-gradient-to-r from-amber-50 to-yellow-50 hover:from-amber-100 hover:to-yellow-100'
            : 'bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100'
        }`}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <div className={`p-1.5 sm:p-2 bg-white rounded-lg shadow-sm ${
            paymentSuccess ? 'ring-2 ring-green-500' : ''
          }`}>
            {paymentSuccess ? (
              <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
            ) : hasUnpaidAmount ? (
              <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
            ) : (
              <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
            )}
          </div>
          <div className="flex-1 text-left">
            <h3 className="font-semibold text-gray-900 text-xs sm:text-sm">
              {paymentSuccess && paidAttendees.length > 0 ? 'Payment Complete' : hasUnpaidAmount ? 'Payment Required' : 'Event Payment'}
            </h3>
            <p className="text-xs text-gray-600">
              {unpaidAttendees.length > 0 && paidAttendees.length > 0 ? (
                `${unpaidAttendees.length} unpaid • ${paidAttendees.length} paid`
              ) : unpaidAttendees.length > 0 ? (
                `${unpaidAttendees.length} attendee${unpaidAttendees.length !== 1 ? 's' : ''} to pay`
              ) : paidAttendees.length > 0 ? (
                `All ${paidAttendees.length} attendee${paidAttendees.length !== 1 ? 's' : ''} paid`
              ) : paymentSummary ? (
                `Total: $${(paymentSummary.totalAmount / 100).toFixed(2)}`
              ) : (
                'Calculating...'
              )}
            </p>
          </div>
          <ChevronDown 
            className={`w-4 h-4 sm:w-5 sm:h-5 text-gray-600 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Collapsible Payment Content */}
      {isExpanded && (
        <div className="p-3 sm:p-4">
          {/* Payment Status Banner */}
          {paymentSuccess && paidAttendees.length > 0 && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-green-900">Payment Successful!</p>
                <p className="text-xs text-green-700">
                  Paid for {paidAttendees.length} attendee{paidAttendees.length !== 1 ? 's' : ''}.
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {paymentError && !showPaymentForm && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
              <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-900">Payment Error</p>
                <p className="text-xs text-red-700">{paymentError}</p>
              </div>
            </div>
          )}

          {/* Payment Form */}
          {showPaymentForm && clientSecret && paymentSummary && (
            <div className="mb-4">
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <PaymentForm
                  amount={paymentSummary.totalAmount}
                  currency={paymentSummary.currency}
                  unpaidAttendees={unpaidAttendees}
                  onSuccess={handlePaymentSuccess}
                  onError={handlePaymentError}
                  onCancel={handleCancelPayment}
                />
              </Elements>
            </div>
          )}

          {/* Attendee Breakdown */}
          {!showPaymentForm && (
            <>
              <div className="space-y-2">
                {/* Paid Attendees Section */}
                {paidAttendees.length > 0 && paidSummary?.breakdown && (
                  <>
                    <div className="text-xs font-semibold text-green-700 mb-1">✅ Paid Attendees</div>
                    {paidSummary.breakdown.map((breakdownItem) => {
                      const attendee = attendees.find(a => a.attendeeId === breakdownItem.attendeeId);
                      const hasEventSupport = !!(breakdownItem.eventSupport && breakdownItem.eventSupport > 0);

                      return (
                        <div 
                          key={breakdownItem.attendeeId} 
                          className="rounded-lg bg-green-50 border border-green-200"
                        >
                          {/* Attendee Header */}
                          <div className="flex items-center justify-between py-2 px-2.5 sm:px-3">
                            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">
                                  {breakdownItem.attendeeName}
                                </p>
                                <p className="text-xs text-gray-500 capitalize">
                                  {breakdownItem.ageGroup === 'adult' ? 'Adult' : 
                                   breakdownItem.ageGroup === '11+' ? '11+ Years' :
                                   breakdownItem.ageGroup === '0-2' ? '0-2 Years' :
                                   breakdownItem.ageGroup === '3-5' ? '3-5 Years' :
                                   breakdownItem.ageGroup === '6-10' ? '6-10 Years' :
                                   breakdownItem.ageGroup}
                                  <span className="ml-2 text-green-600 font-semibold">• PAID</span>
                                </p>
                              </div>
                            </div>
                            <span className="text-xs sm:text-sm font-semibold flex-shrink-0 text-green-700">
                              ${(breakdownItem.subtotal / 100).toFixed(2)}
                            </span>
                          </div>
                          
                          {/* Detailed Breakdown - Show ticket and event support separately */}
                          {(breakdownItem.ticketPrice || hasEventSupport) && (
                            <div className="px-2.5 sm:px-3 pb-2 pt-0 space-y-1 border-t border-green-300/50 mt-1">
                              {breakdownItem.ticketPrice && breakdownItem.ticketPrice > 0 && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-600 ml-6 sm:ml-7">Ticket Price</span>
                                  <span className="text-gray-700 font-medium">
                                    ${(breakdownItem.ticketPrice / 100).toFixed(2)}
                                  </span>
                                </div>
                              )}
                              {hasEventSupport && breakdownItem.eventSupport > 0 && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-600 ml-6 sm:ml-7">Event Support</span>
                                  <span className="text-gray-700 font-medium">
                                    ${(breakdownItem.eventSupport / 100).toFixed(2)}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Unpaid Attendees Section */}
                {paymentSummary?.breakdown.length ? (
                  <>
                    {unpaidAttendees.length > 0 && (
                      <div className="text-xs font-semibold text-amber-700 mb-1 mt-3">💳 Unpaid Attendees</div>
                    )}
                    {/* Remove duplicates and filter out paid attendees */}
                    {paymentSummary.breakdown
                      .filter((item, index, self) => 
                        index === self.findIndex((t) => t.attendeeId === item.attendeeId)
                      )
                      .filter((breakdownItem) => {
                        const attendee = attendees.find(a => a.attendeeId === breakdownItem.attendeeId);
                        return attendee?.paymentStatus !== 'paid';
                      })
                      .map((breakdownItem) => {
                        const attendee = attendees.find(a => a.attendeeId === breakdownItem.attendeeId);
                        const isPaid = attendee?.paymentStatus === 'paid';
                        const hasEventSupport = !!(breakdownItem.eventSupport && breakdownItem.eventSupport > 0);

                        return (
                          <div 
                            key={breakdownItem.attendeeId} 
                            className={`rounded-lg ${
                              isPaid ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                            }`}
                          >
                            {/* Attendee Header */}
                            <div className="flex items-center justify-between py-2 px-2.5 sm:px-3">
                              <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                                {isPaid ? (
                                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                                ) : (
                                  <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">
                                    {breakdownItem.attendeeName}
                                  </p>
                                  <p className="text-xs text-gray-500 capitalize">
                                    {breakdownItem.ageGroup === 'adult' ? 'Adult' : 
                                     breakdownItem.ageGroup === '11+' ? '11+ Years' :
                                     breakdownItem.ageGroup === '0-2' ? '0-2 Years' :
                                     breakdownItem.ageGroup === '3-5' ? '3-5 Years' :
                                     breakdownItem.ageGroup === '6-10' ? '6-10 Years' :
                                     breakdownItem.ageGroup}
                                    {isPaid && <span className="ml-2 text-green-600 font-semibold">• PAID</span>}
                                  </p>
                                </div>
                              </div>
                              <span className={`text-xs sm:text-sm font-semibold flex-shrink-0 ${
                                isPaid ? 'text-green-700' : 'text-gray-900'
                              }`}>
                                ${(breakdownItem.subtotal / 100).toFixed(2)}
                              </span>
                            </div>
                            
                            {/* Detailed Breakdown - Show ticket and event support separately */}
                            {(breakdownItem.ticketPrice || hasEventSupport) && (
                              <div className="px-2.5 sm:px-3 pb-2 pt-0 space-y-1 border-t border-gray-200/50 mt-1">
                                {breakdownItem.ticketPrice && breakdownItem.ticketPrice > 0 && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600 ml-6 sm:ml-7">Ticket Price</span>
                                    <span className="text-gray-700 font-medium">
                                      ${(breakdownItem.ticketPrice / 100).toFixed(2)}
                                    </span>
                                  </div>
                                )}
                                {hasEventSupport && breakdownItem.eventSupport > 0 && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600 ml-6 sm:ml-7">Event Support</span>
                                    <span className="text-gray-700 font-medium">
                                      ${(breakdownItem.eventSupport / 100).toFixed(2)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </>
                ) : (
                  <>
                    {goingAttendees.length === 0 && (
                      <div className="text-center py-6 sm:py-8 text-gray-500">
                        <Users className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-2 text-gray-300" />
                        <p className="text-xs sm:text-sm">Add attendees to see pricing</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Total Section */}
              {paymentSummary && goingAttendees.length > 0 && (
                <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200 space-y-2">
                  {/* Event Support is now included in each attendee's breakdown subtotal */}
                  
                  {/* Total Amount */}
                  <div className={`flex items-center justify-between p-2.5 sm:p-3 rounded-lg border ${
                    paymentSuccess 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-amber-50 border-amber-200'
                  }`}>
                    <div>
                      <span className="text-sm sm:text-base font-bold text-gray-900">
                        {hasUnpaidAmount ? 'Amount Due' : 'Total Amount'}
                      </span>
                      {hasUnpaidAmount && paidAttendees.length > 0 && (
                        <p className="text-xs text-gray-600">
                          {paidAttendees.length} attendee{paidAttendees.length !== 1 ? 's' : ''} already paid
                        </p>
                      )}
                    </div>
                    <span className={`text-lg sm:text-xl font-bold ${
                      paymentSuccess ? 'text-green-600' : 'text-amber-600'
                    }`}>
                      ${hasUnpaidAmount ? (
                        (unpaidAttendees.reduce((sum, attendee) => {
                          const breakdownItem = paymentSummary.breakdown.find(b => b.attendeeId === attendee.attendeeId);
                          return sum + (breakdownItem?.subtotal || 0);
                        }, 0) / 100).toFixed(2)
                      ) : (
                        (paymentSummary.totalAmount / 100).toFixed(2)
                      )}
                    </span>
                  </div>

                  {/* Pay Now Button */}
                  {hasUnpaidAmount && !showPaymentForm && (
                    <button
                      onClick={handlePayNow}
                      disabled={isCreatingIntent || unpaidAttendees.length === 0}
                      className="w-full mt-3 px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isCreatingIntent ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Preparing Payment...
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-5 h-5" />
                          Pay ${(unpaidAttendees.reduce((sum, attendee) => {
                            const breakdownItem = paymentSummary.breakdown.find(b => b.attendeeId === attendee.attendeeId);
                            return sum + (breakdownItem?.subtotal || 0);
                          }, 0) / 100).toFixed(2)}
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
    </>
  );
};
