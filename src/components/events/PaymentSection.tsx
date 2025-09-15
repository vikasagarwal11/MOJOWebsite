import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CreditCard, 
  DollarSign, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  Users,
  ChevronDown,
  ChevronUp,
  RefreshCw
} from 'lucide-react';
import { EventDoc } from '../../hooks/useEvents';
import { Attendee } from '../../types/attendee';
import { PaymentSummary } from '../../types/payment';
import { PaymentService } from '../../services/paymentService';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paidAttendees, setPaidAttendees] = useState<Set<string>>(new Set());

  // Function to refresh payment data
  const refreshPaymentData = async () => {
    if (!currentUser || !event.id) return;
    
    try {
      console.log('🔄 Refreshing payment data...');
      const paidAttendeeIds = await PaymentService.getPaidAttendeeIds(event.id, currentUser.id);
      
      setPaidAttendees(paidAttendeeIds);
      
      console.log('✅ Refreshed payment data');
      console.log('✅ Paid attendees:', Array.from(paidAttendeeIds));
    } catch (error) {
      console.error('❌ Error refreshing payment data:', error);
    }
  };

  // Load existing payments when component mounts or event changes
  useEffect(() => {
    refreshPaymentData();
  }, [currentUser, event.id]);

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

  const hasPaymentRequired = useMemo(() => 
    event.pricing?.requiresPayment && !event.pricing?.isFree,
    [event.pricing]
  );


  // Calculate paid vs pending amounts
  const paymentBreakdown = useMemo(() => {
    if (!paymentSummary) return { totalAmount: 0, paidAmount: 0, pendingAmount: 0, paidAttendees: [], pendingAttendees: [] };

    const paidAttendeesList: any[] = [];
    const pendingAttendeesList: any[] = [];
    let paidAmount = 0;
    let pendingAmount = 0;

    goingAttendees.forEach(attendee => {
      const breakdownItem = paymentSummary.breakdown.find(b => b.attendeeId === attendee.attendeeId);
      if (!breakdownItem) return;

      const attendeeInfo = {
        ...attendee,
        amount: breakdownItem.subtotal,
        currency: paymentSummary.currency
      };

      if (paidAttendees.has(attendee.attendeeId)) {
        paidAttendeesList.push(attendeeInfo);
        paidAmount += breakdownItem.subtotal;
      } else {
        pendingAttendeesList.push(attendeeInfo);
        pendingAmount += breakdownItem.subtotal;
      }
    });

    return {
      totalAmount: paymentSummary.totalAmount,
      paidAmount,
      pendingAmount,
      paidAttendees: paidAttendeesList,
      pendingAttendees: pendingAttendeesList
    };
  }, [paymentSummary, goingAttendees, paidAttendees]);

  const handlePayment = async () => {
    if (!paymentSummary || !hasPaymentRequired) return;

    try {
      console.log('🔍 PaymentSection.handlePayment - START');
      console.log('📊 Payment data:', {
        eventId: event.id,
        currentUserId: currentUser?.id,
        goingAttendeesCount: goingAttendees.length,
        totalAmount: paymentSummary.totalAmount,
        currency: paymentSummary.currency,
        pendingAmount: paymentBreakdown.pendingAmount,
        paidAmount: paymentBreakdown.paidAmount
      });

      setIsProcessing(true);
      setPaymentError(null);

      // Only charge for pending attendees
      const pendingAttendees = paymentBreakdown.pendingAttendees;
      if (pendingAttendees.length === 0) {
        console.log('✅ No pending payments needed');
        onPaymentComplete?.();
        return;
      }

      // Create payment summary for pending attendees only
      const pendingPaymentSummary = {
        totalAmount: paymentBreakdown.pendingAmount,
        currency: paymentSummary.currency,
        breakdown: paymentSummary.breakdown.filter(b => 
          pendingAttendees.some(attendee => attendee.attendeeId === b.attendeeId)
        ),
        status: 'unpaid' as const,
        canRefund: paymentSummary.canRefund
      };

      // Create payment transaction
      console.log('💳 Creating payment transaction for pending attendees...');
      const transactionId = await PaymentService.createPaymentTransaction(
        event.id,
        currentUser?.id || '', // Use current user's ID
        pendingAttendees,
        pendingPaymentSummary
      );

      console.log('🆔 Transaction created with ID:', transactionId);

      // TODO: Integrate with Stripe payment processing
      // For now, simulate successful payment
      console.log('💰 Confirming payment...');
      await PaymentService.confirmPayment(transactionId);
      
      console.log('✅ Payment completed successfully');
      
      // Refresh existing payments to update the UI
      await refreshPaymentData();
      
      onPaymentComplete?.();
    } catch (error) {
      console.error('❌ Payment failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Payment failed';
      setPaymentError(errorMessage);
      onPaymentError?.(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!event.pricing || !hasPaymentRequired) {
    return null; // Don't show payment section for free events
  }

  return (
    <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4 mb-4">
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-green-100 rounded-lg transition-colors"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <DollarSign className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">Payment Required</h3>
            <p className="text-sm text-gray-600">
              {paymentBreakdown.pendingAmount > 0 
                ? `Additional: $${(paymentBreakdown.pendingAmount / 100).toFixed(2)}`
                : paymentBreakdown.paidAmount > 0 
                  ? `Paid: $${(paymentBreakdown.paidAmount / 100).toFixed(2)}`
                  : paymentSummary ? `Total: $${(paymentSummary.totalAmount / 100).toFixed(2)}` : 'Calculating...'
              }
            </p>
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
              {/* Payment Status Summary */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900">Payment Status</h4>
                  <div className="flex items-center gap-2">
                    {paymentBreakdown.pendingAmount === 0 ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <Clock className="w-5 h-5 text-yellow-500" />
                    )}
                    <span className={`text-sm font-medium ${
                      paymentBreakdown.pendingAmount === 0 ? 'text-green-600' : 'text-yellow-600'
                    }`}>
                      {paymentBreakdown.pendingAmount === 0 ? 'Paid' : 'Partially Paid'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {paymentSummary?.breakdown.length ? (
                    <>
                      {/* Paid Attendees */}
                      {paymentBreakdown.paidAttendees.length > 0 && (
                        <div className="mb-3">
                          <h5 className="text-sm font-medium text-green-700 mb-2 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            Paid Attendees
                          </h5>
                          {paymentBreakdown.paidAttendees.map((attendee) => (
                            <div key={attendee.attendeeId} className="flex items-center justify-between py-2 px-3 bg-green-50 rounded-lg mb-2">
                              <div className="flex items-center gap-3">
                                <Users className="w-4 h-4 text-green-600" />
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{attendee.name}</p>
                                  <p className="text-xs text-gray-500 capitalize">
                                    {attendee.ageGroup === 'adult' ? 'Adult' : 
                                     attendee.ageGroup === '11+' ? '11+ Years' :
                                     attendee.ageGroup === '0-2' ? '0-2 Years' :
                                     attendee.ageGroup === '3-5' ? '3-5 Years' :
                                     attendee.ageGroup === '6-10' ? '6-10 Years' :
                                     attendee.ageGroup}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-green-700">
                                  ${(attendee.amount / 100).toFixed(2)}
                                </span>
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Pending Attendees */}
                      {paymentBreakdown.pendingAttendees.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium text-yellow-700 mb-2 flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            Pending Payment
                          </h5>
                          {paymentBreakdown.pendingAttendees.map((attendee) => (
                            <div key={attendee.attendeeId} className="flex items-center justify-between py-2 px-3 bg-yellow-50 rounded-lg mb-2">
                              <div className="flex items-center gap-3">
                                <Users className="w-4 h-4 text-yellow-600" />
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{attendee.name}</p>
                                  <p className="text-xs text-gray-500 capitalize">
                                    {attendee.ageGroup === 'adult' ? 'Adult' : 
                                     attendee.ageGroup === '11+' ? '11+ Years' :
                                     attendee.ageGroup === '0-2' ? '0-2 Years' :
                                     attendee.ageGroup === '3-5' ? '3-5 Years' :
                                     attendee.ageGroup === '6-10' ? '6-10 Years' :
                                     attendee.ageGroup}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900">
                                  ${(attendee.amount / 100).toFixed(2)}
                                </span>
                                <Clock className="w-4 h-4 text-yellow-500" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
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

                <div className="mt-4 pt-3 border-t border-gray-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900">Total Amount</span>
                    <span className="text-lg font-bold text-gray-900">
                      ${(paymentBreakdown.totalAmount / 100).toFixed(2)}
                    </span>
                  </div>
                  {paymentBreakdown.paidAmount > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-green-600">Already Paid</span>
                      <span className="text-green-600 font-medium">
                        ${(paymentBreakdown.paidAmount / 100).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {paymentBreakdown.pendingAmount > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-yellow-600">Remaining Balance</span>
                      <span className="text-yellow-600 font-medium">
                        ${(paymentBreakdown.pendingAmount / 100).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Actions */}
              {paymentBreakdown.pendingAmount > 0 && (
                <div className="space-y-3">
                  {paymentError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500" />
                        <p className="text-sm text-red-700">{paymentError}</p>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handlePayment}
                    disabled={isProcessing || !paymentSummary}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isProcessing ? (
                      <>
                        <LoadingSpinner size="sm" />
                        Processing Payment...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-5 h-5" />
                        Pay Additional ${(paymentBreakdown.pendingAmount / 100).toFixed(2)}
                      </>
                    )}
                  </button>

                  <p className="text-xs text-gray-500 text-center">
                    Secure payment processing powered by Stripe
                  </p>
                </div>
              )}

              {/* All Paid Message */}
              {paymentBreakdown.pendingAmount === 0 && paymentBreakdown.paidAmount > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-sm font-medium text-green-700">
                      All payments completed! Total paid: ${(paymentBreakdown.paidAmount / 100).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Refund Policy */}
              {event.pricing.refundPolicy?.allowed && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <h5 className="text-sm font-medium text-blue-900 mb-1">Refund Policy</h5>
                  <p className="text-xs text-blue-700">
                    Refunds are allowed until {event.pricing.refundPolicy.deadline 
                      ? new Date(event.pricing.refundPolicy.deadline.toMillis()).toLocaleDateString()
                      : 'the event date'
                    }.
                    {event.pricing.refundPolicy.feePercentage && 
                      ` A ${event.pricing.refundPolicy.feePercentage}% processing fee applies.`
                    }
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
