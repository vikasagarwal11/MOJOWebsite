import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  CreditCard,
  DollarSign,
  RefreshCw,
  Users
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { EventDoc } from '../../hooks/useEvents';
import { PaymentService } from '../../services/paymentService';
import { PayPalService } from '../../services/paypalService';
import { ZelleService, ZellePaymentInstructions } from '../../services/zelleService';
import { useAuth } from '../../contexts/AuthContext';
import { Attendee } from '../../types/attendee';
import { PaymentMethod, PaymentSummary } from '../../types/payment';

interface PaymentSectionProps {
  event: EventDoc;
  attendees: Attendee[];
  onPaymentComplete?: () => void;
  onPaymentError?: (error: string) => void;
}

export const PaymentSection: React.FC<PaymentSectionProps> = ({
  event,
  attendees,
  onPaymentComplete,
  onPaymentError
}) => {
  const { currentUser } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('card');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [zelleInstructions, setZelleInstructions] = useState<ZellePaymentInstructions | null>(null);

  // Calculate payment summary when attendees or event pricing changes
  useEffect(() => {
    if (event.pricing) {
      if (attendees.length > 0) {
        const summary = PaymentService.calculatePaymentSummary(attendees, event.pricing);
        setPaymentSummary(summary);
      } else {
        // No attendees - set empty summary
        setPaymentSummary({
          totalAmount: 0,
          currency: event.pricing.currency || 'USD',
          breakdown: [],
          status: 'unpaid' as const,
          canRefund: false
        });
      }
    }
  }, [event.pricing, attendees]);

  const goingAttendees = useMemo(() => 
    attendees.filter(attendee => attendee.rsvpStatus === 'going'),
    [attendees]
  );

  const hasPaymentRequired = useMemo(() => {
    const hasEventSupportAmount = event.pricing?.eventSupportAmount && event.pricing.eventSupportAmount > 0;
    const hasTicketPrice = event.pricing?.requiresPayment && !event.pricing?.isFree;
    return hasTicketPrice || hasEventSupportAmount;
  }, [event.pricing]);

  if (!event.pricing || !hasPaymentRequired) {
    return null; // Don't show payment section for free events
  }

  return (
    <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-2 sm:p-3 mb-4">
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-2 sm:p-3 hover:bg-green-100 rounded-lg transition-colors"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="flex items-center gap-3 flex-1">
          <div className="p-2 bg-green-100 rounded-lg">
            <DollarSign className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-left flex-1">
            <h3 className="font-semibold text-gray-900">Payment Required</h3>
            <div className="text-sm text-gray-600">
              <p>
                {paymentSummary ? `Total: $${(paymentSummary.totalAmount / 100).toFixed(2)}` : 'Calculating...'}
              </p>
            </div>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="pt-4 space-y-4">
              {/* Payment Method Selection */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <h4 className="font-medium text-gray-900 mb-3">Select Payment Method</h4>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[
                    { value: 'card', label: 'Credit/Debit Card', icon: CreditCard },
                    { value: 'paypal', label: 'PayPal', icon: DollarSign },
                    { value: 'venmo', label: 'Venmo', icon: DollarSign },
                    { value: 'zelle', label: 'Zelle', icon: DollarSign }
                  ].map((method) => {
                    const Icon = method.icon;
                    return (
                      <button
                        key={method.value}
                        onClick={() => setSelectedPaymentMethod(method.value as PaymentMethod)}
                        className={`p-3 rounded-lg border-2 transition-all flex items-center gap-2 ${
                          selectedPaymentMethod === method.value
                            ? 'border-[#F25129] bg-orange-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Icon className={`w-5 h-5 ${selectedPaymentMethod === method.value ? 'text-[#F25129]' : 'text-gray-400'}`} />
                        <span className={`text-sm font-semibold ${selectedPaymentMethod === method.value ? 'text-[#F25129]' : 'text-gray-700'}`}>
                          {method.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* PayPal/Venmo Button Container */}
                {(selectedPaymentMethod === 'paypal' || selectedPaymentMethod === 'venmo') && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs text-blue-800 mb-2">
                      {selectedPaymentMethod === 'venmo' ? 'Venmo' : 'PayPal'} payment will be processed securely.
                    </p>
                    <div id="paypal-button-container" className="mt-2">
                      {/* PayPal buttons will be rendered here by PayPal SDK */}
                    </div>
                    <p className="text-xs text-gray-500 italic mt-2">
                      Note: PayPal SDK integration requires Cloud Functions setup. See docs/PAYMENT_SETUP_INSTRUCTIONS.md
                    </p>
                  </div>
                )}

                {/* Zelle Instructions */}
                {selectedPaymentMethod === 'zelle' && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs sm:text-sm font-semibold text-blue-900 mb-2">
                      Zelle Payment Instructions:
                    </p>
                    <p className="text-xs sm:text-sm text-blue-800">
                      After processing payment, you'll receive Zelle payment instructions.
                      Please send payment to complete your registration.
                    </p>
                  </div>
                )}

                {/* Stripe Card Payment */}
                {selectedPaymentMethod === 'card' && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs sm:text-sm text-blue-800">
                      Credit/Debit card payments will be processed securely via Stripe.
                    </p>
                    <p className="text-xs text-gray-500 italic mt-2">
                      Note: Stripe integration requires setup. See docs/PAYMENT_SETUP_INSTRUCTIONS.md
                    </p>
                  </div>
                )}
              </div>

              {/* Payment Breakdown */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <h4 className="font-medium text-gray-900 mb-3">Payment Breakdown</h4>

                <div className="space-y-2">
                  {paymentSummary?.breakdown.length ? (
                    <>
                      {/* List all attendees with their prices from breakdown */}
                      {paymentSummary.breakdown.map((breakdownItem) => {
                        return (
                          <div key={breakdownItem.attendeeId} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <Users className="w-4 h-4 text-gray-600" />
                              <div>
                                <p className="text-sm font-medium text-gray-900">{breakdownItem.attendeeName}</p>
                                <p className="text-xs text-gray-500 capitalize">
                                  {breakdownItem.ageGroup === 'adult' ? 'Adult' : 
                                   breakdownItem.ageGroup === '11+' ? '11+ Years' :
                                   breakdownItem.ageGroup === '0-2' ? '0-2 Years' :
                                   breakdownItem.ageGroup === '3-5' ? '3-5 Years' :
                                   breakdownItem.ageGroup === '6-10' ? '6-10 Years' :
                                   breakdownItem.ageGroup}
                                </p>
                              </div>
                            </div>
                            <span className="text-sm font-medium text-gray-900">
                              ${(breakdownItem.subtotal / 100).toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div className="text-center py-4 text-gray-500">
                      {goingAttendees.length === 0 ? (
                        <>
                          <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                          <p className="text-sm">Add attendees to see pricing</p>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2" />
                          <p className="text-sm">Calculating prices...</p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Total Section */}
                {paymentSummary && goingAttendees.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-200 space-y-2">
                    {/* Event Support Amount - Show if applicable */}
                    {event.pricing?.eventSupportAmount && event.pricing.eventSupportAmount > 0 && (
                      <div className="flex items-center justify-between text-sm bg-blue-50 p-2 rounded-lg">
                        <span className="text-blue-700 font-medium">
                          Event Support Amt ({goingAttendees.length} × ${(event.pricing.eventSupportAmount / 100).toFixed(2)})
                        </span>
                        <span className="text-blue-700 font-semibold">
                          ${((event.pricing.eventSupportAmount * goingAttendees.length) / 100).toFixed(2)}
                        </span>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900">Total Amount Due</span>
                      <span className="text-xl font-bold text-green-600">
                        ${(paymentSummary.totalAmount / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Process Payment Button */}
                {paymentSummary && paymentSummary.totalAmount > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <button
                      onClick={async () => {
                        if (!currentUser || !paymentSummary) return;
                        
                        setProcessingPayment(true);
                        try {
                          // Create payment transaction
                          const transactionId = await PaymentService.createPaymentTransaction(
                            event.id,
                            currentUser.id,
                            goingAttendees,
                            paymentSummary,
                            selectedPaymentMethod
                          );

                          // Process payment based on method
                          if (selectedPaymentMethod === 'paypal' || selectedPaymentMethod === 'venmo') {
                            await PayPalService.loadPayPalSDK();
                            toast.success(`Please complete payment using ${selectedPaymentMethod === 'venmo' ? 'Venmo' : 'PayPal'}`);
                            // PayPal processing will be handled via PayPal buttons
                          } else if (selectedPaymentMethod === 'zelle') {
                            const instructions = ZelleService.generatePaymentInstructions(
                              transactionId,
                              paymentSummary.totalAmount,
                              event.title
                            );
                            setZelleInstructions(instructions);
                            await ZelleService.markPaymentPending(transactionId);
                            toast.success('Zelle payment instructions displayed.');
                          } else if (selectedPaymentMethod === 'card') {
                            // Stripe processing would go here
                            await PaymentService.updatePaymentStatus(transactionId, 'pending');
                            toast.success('Card payment processing will be integrated with Stripe');
                          }

                          if (onPaymentComplete) {
                            onPaymentComplete();
                          }
                        } catch (error: any) {
                          console.error('Payment processing error:', error);
                          const errorMessage = error.message || 'Failed to process payment';
                          toast.error(errorMessage);
                          if (onPaymentError) {
                            onPaymentError(errorMessage);
                          }
                        } finally {
                          setProcessingPayment(false);
                        }
                      }}
                      disabled={processingPayment || !paymentSummary || paymentSummary.totalAmount === 0}
                      className="w-full bg-gradient-to-r from-[#F25129] to-orange-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-[#E0451F] hover:to-orange-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processingPayment ? 'Processing...' : `Pay $${(paymentSummary.totalAmount / 100).toFixed(2)}`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Zelle Instructions Modal */}
      {zelleInstructions && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Zelle Payment Instructions</h3>
              <button
                onClick={() => setZelleInstructions(null)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <ChevronUp className="w-5 h-5 text-gray-600 rotate-45" />
              </button>
            </div>
            <div className="space-y-4 text-sm">
              <p className="text-gray-700">Please send payment via Zelle using the following details:</p>
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <div><strong>Email:</strong> {zelleInstructions.email}</div>
                <div><strong>Phone:</strong> {zelleInstructions.phone}</div>
                <div><strong>Amount:</strong> ${zelleInstructions.amount.toFixed(2)}</div>
                <div><strong>Memo:</strong> {zelleInstructions.memo}</div>
              </div>
              <p className="text-xs text-gray-600">
                <strong>Important:</strong> Include the memo in your Zelle payment so we can match it to your registration.
              </p>
              <p className="text-xs text-gray-600">
                Your registration will be confirmed once we receive and verify your payment.
              </p>
              <button
                onClick={() => {
                  setZelleInstructions(null);
                  if (onPaymentComplete) {
                    onPaymentComplete();
                  }
                }}
                className="w-full bg-gradient-to-r from-[#F25129] to-orange-600 text-white py-3 px-4 rounded-lg font-semibold hover:from-[#E0451F] hover:to-orange-700 transition-all"
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
