import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, MapPin, Users, Share2, Clock, Link } from 'lucide-react';
import { format } from 'date-fns';
import { safeFormat, safeToDate } from '../../utils/dateUtils';
import { EventDoc } from '../../hooks/useEvents';

interface PastEventModalProps {
  open: boolean;
  event: EventDoc | null;
  onClose: () => void;
}

// Animation variants
const modalVariants = {
  hidden: { 
    opacity: 0,
    scale: 0.8,
    y: 50
  },
  visible: { 
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      damping: 25,
      stiffness: 300,
      duration: 0.3
    }
  },
  exit: { 
    opacity: 0,
    scale: 0.8,
    y: 50,
    transition: {
      duration: 0.2
    }
  }
};

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.2 } }
};

export const PastEventModal: React.FC<PastEventModalProps> = ({ open, event, onClose }) => {
  console.log('🔍 PastEventModal render:', {
    open,
    eventId: event?.id,
    eventTitle: event?.title,
    eventStartAt: event?.startAt,
    eventEndAt: event?.endAt
  });

  // Prevent unnecessary re-renders
  const memoizedEvent = React.useMemo(() => event, [event?.id]);

  if (!memoizedEvent) return null;

  // Calculate event duration with better date handling
  const getEventDuration = () => {
    if (!memoizedEvent.startAt || !memoizedEvent.endAt) return '';
    
    const start = safeToDate(memoizedEvent.startAt);
    const end = safeToDate(memoizedEvent.endAt);
    
    if (!start || !end) return '';
    
    const diffMs = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (diffDays > 0) {
      return diffHours > 0 ? `(${diffDays}d ${diffHours}h)` : `(${diffDays} days)`;
    } else if (diffHours > 0) {
      return `(${diffHours} hours)`;
    } else {
      return '(1 hour)';
    }
  };

  // Format date safely
  const formatEventDate = (date: any) => {
    return safeFormat(date, 'EEEE, MMMM d, yyyy', 'Date not available');
  };

  // Format end date safely
  const formatEndDate = (date: any) => {
    return safeFormat(date, 'MMM d, yyyy h:mm a', 'End date not available');
  };

  // Share event
  const shareEvent = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: memoizedEvent.title,
          text: `Check out this past event: ${memoizedEvent.title}`,
          url: `${window.location.origin}/events/${memoizedEvent.id}`
        });
      } catch (error) {
        console.log('Error sharing:', error);
      }
    } else {
      // Fallback: copy to clipboard
      const url = `${window.location.origin}/events/${memoizedEvent.id}`;
      await navigator.clipboard.writeText(url);
      // You could show a toast here
    }
  };

  // Copy event link
  const copyEventLink = async () => {
    const url = `${window.location.origin}/events/${memoizedEvent.id}`;
    await navigator.clipboard.writeText(url);
    // You could show a toast here
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          
          {/* Modal */}
          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
              {/* Header */}
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Clock className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Past Event</h2>
                    <p className="text-sm text-gray-500">Event has ended</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Event Image */}
              {memoizedEvent.imageUrl && (
                <div className="relative h-56 overflow-hidden">
                  <img
                    src={memoizedEvent.imageUrl}
                    alt={memoizedEvent.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      console.warn(`🚨 PastEventModal: Failed to load image: ${memoizedEvent.imageUrl}`);
                      // Hide image if it fails to load
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                </div>
              )}

              {/* Event Content */}
              <div className="p-6 overflow-y-auto max-h-96">
                {/* Event Title */}
                <h3 className="text-2xl font-bold text-gray-900 mb-3">
                  {memoizedEvent.title}
                </h3>

                {/* Event Description */}
                {memoizedEvent.description && (
                  <div className="mb-6">
                    <h4 className="text-lg font-semibold text-gray-800 mb-2">Event Description</h4>
                    <p className="text-gray-600 leading-relaxed">
                      {memoizedEvent.description}
                    </p>
                  </div>
                )}

                {/* Event Details */}
                <div className="space-y-4 mb-6">
                  {/* Date and Duration */}
                  <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <Calendar className="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-medium text-gray-900">
                        {memoizedEvent.startAt ? formatEventDate(memoizedEvent.startAt) : 'Date TBD'}
                      </div>
                      {getEventDuration() && (
                        <div className="text-sm text-gray-600 mt-1">
                          Duration: {getEventDuration()}
                        </div>
                      )}
                      {memoizedEvent.endAt && (
                        <div className="text-sm text-gray-500 mt-1">
                          Ended: {formatEndDate(memoizedEvent.endAt)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Location */}
                  {memoizedEvent.location && (
                    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <MapPin className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-medium text-gray-900">Location</div>
                        <div className="text-gray-600">{memoizedEvent.location}</div>
                      </div>
                    </div>
                  )}

                  {/* Capacity */}
                  {memoizedEvent.maxAttendees && (
                    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <Users className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-medium text-gray-900">Capacity</div>
                        <div className="text-gray-600">{memoizedEvent.maxAttendees} attendees</div>
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {memoizedEvent.tags && memoizedEvent.tags.length > 0 && (
                    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="w-5 h-5 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-medium text-gray-900 mb-2">Event Tags</div>
                        <div className="flex flex-wrap gap-2">
                          {memoizedEvent.tags.map((tag, index) => (
                            <span
                              key={index}
                              className="px-3 py-1 bg-purple-100 text-purple-700 text-sm rounded-full font-medium"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  This event has ended and RSVP is no longer available
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={shareEvent}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </button>
                  <button
                    onClick={copyEventLink}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <Link className="w-4 h-4" />
                    Copy Link
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};
