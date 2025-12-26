import { motion } from 'framer-motion';
import { Calendar, Clock, MapPin, Tag, Users } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { EventDoc } from '../../hooks/useEvents';
import { safeFormat, safeToDate } from '../../utils/dateUtils';
import { EventImage } from './EventImage';

interface EventCardReadOnlyProps {
  event: EventDoc;
}

const EventCardReadOnly: React.FC<EventCardReadOnlyProps> = ({ event }) => {
  // Helper function to get event status - implements complete logic
  const getEventStatus = (event: EventDoc): { status: string; color: string; bgColor: string } => {
    // If status is not "scheduled" → Closed
    if (event.status && event.status !== 'scheduled') {
      return { status: 'Closed', color: 'text-gray-800', bgColor: 'bg-gray-100' };
    }
    
    // If attendingCount >= capacity → Sold Out
    if (event.maxAttendees && event.attendingCount && event.attendingCount >= event.maxAttendees) {
      return { status: 'Sold Out', color: 'text-red-800', bgColor: 'bg-red-100' };
    }
    
    // If waitlistCount > 0 → Waitlist
    if (event.waitlistCount && event.waitlistCount > 0) {
      return { status: 'Waitlist', color: 'text-yellow-800', bgColor: 'bg-yellow-100' };
    }
    
    // Else → Open
    return { status: 'Open', color: 'text-green-800', bgColor: 'bg-green-100' };
  };

  // Helper function to format event date
  const formatEventDate = (date: any) => {
    try {
      const dateObj = safeToDate(date);
      return safeFormat(dateObj, 'EEE, MMM d, yyyy');
    } catch (error) {
      return 'Date TBD';
    }
  };

  // Helper function to format event time
  const formatEventTime = (date: any) => {
    try {
      const dateObj = safeToDate(date);
      return safeFormat(dateObj, 'h:mm a');
    } catch (error) {
      return 'Time TBD';
    }
  };

  // Helper function to get event duration
  const getEventDuration = () => {
    if (!event.startAt || !event.endAt) return null;
    try {
      const start = safeToDate(event.startAt);
      const end = safeToDate(event.endAt);
      const diffMs = end.getTime() - start.getTime();
      const diffHours = Math.round(diffMs / (1000 * 60 * 60));
      return diffHours;
    } catch (error) {
      return null;
    }
  };

  // Helper function to get display venue info
  const getDisplayVenueInfo = (venueName: string, venueAddress: string, showFull: boolean) => {
    if (venueName && venueAddress) {
      return showFull ? `${venueName}, ${venueAddress}` : venueName;
    }
    return venueName || venueAddress || '';
  };

  const eventStatus = getEventStatus(event);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }}
      transition={{ duration: 0.3 }}
      className="group"
    >
      <Link to={`/events/${event.id}`} className="block">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300 h-full">
          {/* Event Image with Smart Cropping Prevention */}
          <EventImage 
            src={event.imageUrl} 
            alt={event.title} 
            fit="contain" 
            aspect="16/9"
            className="group-hover:scale-105 transition-transform duration-300"
            title={event.title}
          >
            {/* Status Badge Only */}
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${eventStatus.bgColor} ${eventStatus.color}`}>
              {eventStatus.status}
            </span>
          </EventImage>

          {/* Event Content */}
          <div className="p-6">
            {/* Event Title */}
            <h3 className="text-xl font-bold text-gray-900 mb-3 line-clamp-2 group-hover:text-[#F25129] transition-colors duration-200">
              {event.title}
            </h3>

            {/* Event Description */}
            {event.description && (
              <p className="text-gray-600 text-sm leading-relaxed mb-4 line-clamp-3">
                {event.description}
              </p>
            )}

            {/* Event Details */}
            <div className="space-y-3">
              {/* Date */}
              <div className="flex items-center text-gray-700">
                <Calendar className="w-4 h-4 mr-3 text-[#F25129] flex-shrink-0" />
                <span className="text-sm">{formatEventDate(event.startAt)}</span>
              </div>

              {/* Time */}
              {event.startAt && (
                <div className="flex items-center text-gray-700">
                  <Clock className="w-4 h-4 mr-3 text-[#F25129] flex-shrink-0" />
                  <span className="text-sm">
                    {formatEventTime(event.startAt)}
                    {event.endAt && ` - ${formatEventTime(event.endAt)}`}
                    {(() => {
                      const duration = getEventDuration();
                      return duration ? ` (${duration}h)` : '';
                    })()}
                  </span>
                </div>
              )}

              {/* Location */}
              {(event.venueName || event.venueAddress || event.location) && (
                <div className="flex items-start text-gray-700">
                  <MapPin className="w-4 h-4 mr-3 text-[#F25129] mt-0.5 flex-shrink-0" />
                  <span className="text-sm line-clamp-2">
                    {event.location || getDisplayVenueInfo(event.venueName || '', event.venueAddress || '', false)}
                  </span>
                </div>
              )}

              {/* Attendee Count */}
              {event.maxAttendees && (
                <div className="text-gray-700">
                  <div className="flex items-center text-sm">
                    <Users className="w-4 h-4 mr-3 text-[#F25129] flex-shrink-0" />
                    <span>{event.attendingCount || 0}/{event.maxAttendees} spots</span>
                  </div>
                  {/* Only show waitlist if waitlist is enabled */}
                  {event.waitlistEnabled && (
                    <div className="flex items-center text-sm text-gray-600 mt-1">
                      <Users className="w-4 h-4 mr-3 text-yellow-600 flex-shrink-0" />
                      <span>{event.waitlistCount || 0} on waitlist</span>
                    </div>
                  )}
                </div>
              )}

              {/* Price Information */}
              {event.pricing && (
                <div className="flex items-center text-gray-700">
                  <span className="w-4 h-4 mr-3 flex-shrink-0 flex items-center justify-center">
                    <span className="text-sm font-bold text-green-600">$</span>
                  </span>
                  <span className="text-sm font-semibold text-green-600">
                    {event.pricing.adultPrice ? `$${event.pricing.adultPrice}` : 'Free'}
                  </span>
                </div>
              )}

              {/* Tags */}
              {event.tags && event.tags.length > 0 && (
                <div className="flex items-start text-gray-700">
                  <Tag className="w-4 h-4 mr-3 text-[#F25129] mt-0.5 flex-shrink-0" />
                  <div className="flex flex-wrap gap-1">
                    {event.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                      >
                        {tag}
                      </span>
                    ))}
                    {event.tags.length > 3 && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        +{event.tags.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* View Details Button */}
            <div className="mt-6 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-center text-[#F25129] text-sm font-medium group-hover:text-[#E0451F] transition-colors duration-200">
                <span>View Details</span>
                <svg className="w-4 h-4 ml-2 transform group-hover:translate-x-1 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
};

export { EventCardReadOnly };

