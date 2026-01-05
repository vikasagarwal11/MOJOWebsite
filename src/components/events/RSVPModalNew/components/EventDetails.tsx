import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, ChevronDown, ChevronUp, Clock, ExternalLink, MapPin } from 'lucide-react';
import React, { useState } from 'react';
import { EventDoc } from '../../../../hooks/useEvents';
import { safeFormat, safeToDate } from '../../../../utils/dateUtils';
import { useEventDates } from '../hooks/useEventDates';

interface EventDetailsProps {
  event: EventDoc;
  isMobile?: boolean;
}

export const EventDetails: React.FC<EventDetailsProps> = ({ 
  event, 
  isMobile = false 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { dateLabel, timeWithDuration } = useEventDates(event);

  // On mobile, show the collapsible details section
  if (isMobile) {
    const startDate = safeToDate(event.startAt);
    const endDate = safeToDate(event.endAt);
    const dayOfWeek = startDate ? safeFormat(startDate, 'EEEE') : '';
    const dateFormatted = startDate ? safeFormat(startDate, 'MMMM d, yyyy') : 'TBD';
    const timeFormatted = startDate 
      ? `${safeFormat(startDate, 'h:mm a')}${endDate ? ` - ${safeFormat(endDate, 'h:mm a')}` : ''}`
      : 'TBD';
    
    // Calculate duration
    let durationText = '';
    if (startDate && endDate) {
      const diffMs = endDate.getTime() - startDate.getTime();
      const diffHours = Math.round(diffMs / (1000 * 60 * 60));
      durationText = `${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
    }
    
    const locationText = event.location || (event.venueName && event.venueAddress 
      ? `${event.venueName}, ${event.venueAddress}`
      : event.venueName || event.venueAddress || '');
    
    const mapsUrl = locationText ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationText)}` : '';

    // Redesigned container: gradient background (blue-50 to purple-50) matching PaymentSection pattern,
    // theme border color (#F25129) for brand consistency, removed outer padding wrapper to align width
    // Cross-browser optimizations for Safari, Chrome, Firefox on all devices
    return (
      <motion.div 
        className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-[#F25129] rounded-xl mb-4 shadow-sm overflow-hidden"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.1 }}
        style={{
          WebkitBackfaceVisibility: 'hidden',
          backfaceVisibility: 'hidden',
          transform: 'translateZ(0)',
          willChange: 'auto'
        }}
      >
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full p-3 sm:p-4 flex items-center justify-between text-left hover:bg-blue-100/50 active:bg-blue-100/70 transition-colors rounded-t-xl touch-manipulation"
            aria-expanded={isExpanded}
            aria-controls="event-details-content"
            style={{
              WebkitTapHighlightColor: 'transparent'
            }}
          >
            <span className="font-semibold text-gray-900 text-sm sm:text-base select-none">Event Details</span>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 transition-transform flex-shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 transition-transform flex-shrink-0" />
            )}
          </button>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                id="event-details-content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="overflow-hidden"
                style={{
                  WebkitBackfaceVisibility: 'hidden',
                  backfaceVisibility: 'hidden'
                }}
              >
                {/* Content with icons matching second screenshot */}
                <div 
                  className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-3 sm:space-y-4 text-sm"
                  style={{ 
                    overscrollBehavior: 'contain',
                    WebkitOverflowScrolling: 'touch'
                  }}
                >
                  {/* Date - with calendar icon (blue background matching screenshot design) */}
                  {startDate && (
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0 shadow-sm">
                        <Calendar className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 break-words">{dateFormatted}</div>
                        {dayOfWeek && (
                          <div className="text-xs text-gray-600 mt-0.5">{dayOfWeek}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Time - with clock icon (green background matching screenshot design) */}
                  {startDate && (
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-green-100 rounded-lg flex-shrink-0 shadow-sm">
                        <Clock className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 break-words">{timeFormatted}</div>
                        {durationText && (
                          <div className="text-xs text-gray-600 mt-0.5">{durationText}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Location - with map pin icon (red background matching screenshot design) */}
                  {locationText && (
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-red-100 rounded-lg flex-shrink-0 shadow-sm">
                        <MapPin className="w-5 h-5 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 break-words">{locationText}</div>
                        {mapsUrl && (
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-[#F25129] hover:text-[#E0451F] hover:underline mt-0.5 inline-flex items-center gap-1 touch-manipulation"
                            style={{
                              WebkitTapHighlightColor: 'transparent'
                            }}
                          >
                            Get Directions <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Event Description */}
                  {event.description && (
                    <div className="pt-2 border-t border-gray-200">
                      <div className="font-semibold text-gray-900 text-xs uppercase tracking-wide mb-2">DESCRIPTION:</div>
                      <p className="text-gray-700 leading-relaxed break-words whitespace-pre-wrap overflow-wrap-anywhere">
                        {event.description}
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
    );
  }

  // On desktop, don't render anything (details are in the header)
  return null;
};
