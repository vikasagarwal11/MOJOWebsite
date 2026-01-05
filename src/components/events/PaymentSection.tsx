import { ChevronDown, DollarSign, RefreshCw, Users } from 'lucide-react';
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
  attendees
}) => {
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

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
    <div className="bg-white border border-gray-200 rounded-lg mb-3 sm:mb-4 overflow-hidden">
      {/* Clickable Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full bg-gradient-to-r from-green-50 to-emerald-50 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-200 hover:from-green-100 hover:to-emerald-100 transition-colors"
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-white rounded-lg shadow-sm">
            <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
          </div>
          <div className="flex-1 text-left">
            <h3 className="font-semibold text-gray-900 text-xs sm:text-sm">Payment Summary</h3>
            <p className="text-xs text-gray-600">
              {paymentSummary ? `Total: $${(paymentSummary.totalAmount / 100).toFixed(2)}` : 'Calculating...'}
            </p>
          </div>
          <ChevronDown 
            className={`w-4 h-4 sm:w-5 sm:h-5 text-gray-600 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Collapsible Payment Breakdown */}
      {isExpanded && (
        <div className="p-3 sm:p-4">
          <div className="space-y-2">
            {paymentSummary?.breakdown.length ? (
              <>
                {/* Remove duplicates by using a Set to track unique attendee IDs */}
                {paymentSummary.breakdown
                  .filter((item, index, self) => 
                    index === self.findIndex((t) => t.attendeeId === item.attendeeId)
                  )
                  .map((breakdownItem) => {
                    return (
                      <div key={breakdownItem.attendeeId} className="flex items-center justify-between py-2 px-2.5 sm:px-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                          <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">{breakdownItem.attendeeName}</p>
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
                        <span className="text-xs sm:text-sm font-semibold text-gray-900 flex-shrink-0">
                          ${(breakdownItem.subtotal / 100).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
              </>
            ) : (
              <div className="text-center py-6 sm:py-8 text-gray-500">
                {goingAttendees.length === 0 ? (
                  <>
                    <Users className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-2 text-gray-300" />
                    <p className="text-xs sm:text-sm">Add attendees to see pricing</p>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin mx-auto mb-2" />
                    <p className="text-xs sm:text-sm">Calculating prices...</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Total Section */}
          {paymentSummary && goingAttendees.length > 0 && (
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200 space-y-2">
              {/* Event Support Amount - Show if applicable */}
              {event.pricing?.eventSupportAmount && event.pricing.eventSupportAmount > 0 && (
                <div className="flex items-center justify-between p-2 sm:p-2.5 bg-blue-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-blue-900">Event Support Amount</p>
                    <p className="text-xs text-blue-700">
                      {goingAttendees.length} × ${(event.pricing.eventSupportAmount / 100).toFixed(2)}
                    </p>
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-blue-900 flex-shrink-0">
                    ${((event.pricing.eventSupportAmount * goingAttendees.length) / 100).toFixed(2)}
                  </span>
                </div>
              )}
              
              {/* Total Amount */}
              <div className="flex items-center justify-between p-2.5 sm:p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-sm sm:text-base font-bold text-gray-900">Total Amount</span>
                <span className="text-lg sm:text-xl font-bold text-green-600">
                  ${(paymentSummary.totalAmount / 100).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
