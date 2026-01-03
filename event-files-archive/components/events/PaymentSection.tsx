import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  DollarSign,
  RefreshCw,
  Users
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { EventDoc } from '../../hooks/useEvents';
import { PaymentService } from '../../services/paymentService';
import { Attendee } from '../../types/attendee';
import { PaymentSummary } from '../../types/payment';

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
    <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4 mb-4">
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-green-100 rounded-lg transition-colors"
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
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
