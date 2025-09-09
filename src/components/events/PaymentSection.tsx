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
  const [isExpanded, setIsExpanded] = useState(false);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Calculate payment summary when attendees or event pricing changes
  useEffect(() => {
    if (event.pricing && attendees.length > 0) {
      const summary = PaymentService.calculatePaymentSummary(attendees, event.pricing);
      setPaymentSummary(summary);
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

  const totalPaidAmount = useMemo(() => 
    paymentSummary?.totalAmount || 0,
    [paymentSummary]
  );

  const allAttendeesPaid = useMemo(() => 
    goingAttendees.length > 0 && goingAttendees.every(attendee => attendee.paymentStatus === 'paid'),
    [goingAttendees]
  );

  const handlePayment = async () => {
    if (!paymentSummary || !hasPaymentRequired) return;

    try {
      setIsProcessing(true);
      setPaymentError(null);

      // Create payment transaction
      const transactionId = await PaymentService.createPaymentTransaction(
        event.id,
        attendees[0]?.userId || '', // Use first attendee's userId
        goingAttendees,
        paymentSummary
      );

      // TODO: Integrate with Stripe payment processing
      // For now, simulate successful payment
      await PaymentService.updatePaymentStatus(transactionId, 'paid');
      
      onPaymentComplete?.();
    } catch (error) {
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
              {paymentSummary ? `Total: $${(paymentSummary.totalAmount / 100).toFixed(2)}` : 'Calculating...'}
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
                    {allAttendeesPaid ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <Clock className="w-5 h-5 text-yellow-500" />
                    )}
                    <span className={`text-sm font-medium ${
                      allAttendeesPaid ? 'text-green-600' : 'text-yellow-600'
                    }`}>
                      {allAttendeesPaid ? 'Paid' : 'Pending'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {paymentSummary?.breakdown.length ? (
                    paymentSummary.breakdown.map((item) => {
                      const attendee = goingAttendees.find(a => a.attendeeId === item.attendeeId);
                      if (!attendee) return null;
                      
                      return (
                        <div key={attendee.attendeeId} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                          <div className="flex items-center gap-3">
                            <Users className="w-4 h-4 text-gray-400" />
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
                              ${(item.price / 100).toFixed(2)}
                            </span>
                            {attendee.paymentStatus === 'paid' ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-yellow-500" />
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-4 text-gray-500">
                      <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2" />
                      <p className="text-sm">Calculating prices...</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900">Total Amount</span>
                    <span className="text-lg font-bold text-green-600">
                      ${(totalPaidAmount / 100).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Actions */}
              {!allAttendeesPaid && (
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
                        Pay ${paymentSummary ? (paymentSummary.totalAmount / 100).toFixed(2) : '0.00'}
                      </>
                    )}
                  </button>

                  <p className="text-xs text-gray-500 text-center">
                    Secure payment processing powered by Stripe
                  </p>
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
