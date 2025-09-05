import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEventDates } from '../hooks/useEventDates';
import { EventDoc } from '../../../../hooks/useEvents';

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
    return (
      <motion.div 
        className="bg-gray-50 border border-gray-200 rounded-lg mx-4 mb-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.1 }}
      >
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-3 flex items-center justify-between text-left hover:bg-gray-100 transition-colors"
          aria-expanded={isExpanded}
          aria-controls="event-details-content"
        >
          <span className="font-medium text-gray-700">Event Details</span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </button>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              id="event-details-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="overflow-hidden"
            >
              {/* Scrollable content with max height */}
              <div 
                className="px-3 pb-3 space-y-3 text-sm max-h-[40vh] overflow-y-auto event-details-scrollbar"
                style={{ 
                  overscrollBehavior: 'contain'
                }}
              >
                {/* Date & Duration (combined) */}
                <div>
                  <span className="font-bold text-gray-800">Date & Duration:</span>
                  <p className="text-gray-700 mt-1">{dateLabel} • {timeWithDuration}</p>
                </div>

                {/* Venue */}
                <div>
                  <span className="font-bold text-gray-800">Venue:</span>
                  <p className="text-gray-700 mt-1">{event.venueName || 'TBD'}</p>
                </div>

                {/* Full Address */}
                {event.venueAddress && (
                  <div>
                    <span className="font-bold text-gray-800">Address:</span>
                    <p className="text-gray-700 mt-1 leading-relaxed">
                      {event.venueAddress}
                    </p>
                  </div>
                )}

                {/* Event Description */}
                {event.description && (
                  <div>
                    <span className="font-bold text-gray-800">Description:</span>
                    <p className="text-gray-700 mt-1 leading-relaxed">
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
