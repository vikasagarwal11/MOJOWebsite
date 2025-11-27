import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, MapPin, Users, Share2, Clock, Link, ZoomIn } from 'lucide-react';
import { safeFormat, safeToDate } from '../../utils/dateUtils';
import { EventDoc } from '../../hooks/useEvents';
import { EventImageLightbox } from './EventImageLightbox';
import { getThumbnailUrl } from '../../utils/thumbnailUtils';
import { isFirebaseStorageUrl } from '../../utils/thumbnailUtils';

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
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  if (!memoizedEvent) return null;

  // Get thumbnail URL - only for Firebase Storage URLs, otherwise use original with size constraint
  const isFirebaseUrl = memoizedEvent.imageUrl ? isFirebaseStorageUrl(memoizedEvent.imageUrl) : false;
  const thumbnailUrl = memoizedEvent.imageUrl && isFirebaseUrl
    ? getThumbnailUrl(memoizedEvent.imageUrl, 'medium')
    : '';
  
  // Use thumbnail if available and different from original, otherwise use original URL
  const useThumbnail = isFirebaseUrl && thumbnailUrl && thumbnailUrl !== memoizedEvent.imageUrl;
  const displayUrl = useThumbnail ? thumbnailUrl : (memoizedEvent.imageUrl || '');
  
  // Debug logging
  console.log('🔍 PastEventModal Image Debug:', {
    originalUrl: memoizedEvent.imageUrl,
    isFirebaseUrl,
    thumbnailUrl,
    useThumbnail,
    displayUrl,
    thumbnailUrlDifferent: thumbnailUrl !== memoizedEvent.imageUrl
  });
  
  const handleThumbnailClick = () => {
    if (memoizedEvent.imageUrl) {
      setIsLightboxOpen(true);
    }
  };

  const venueName = memoizedEvent.venueName || '';
  const venueAddress = memoizedEvent.venueAddress || '';
  const legacyLocation = memoizedEvent.location || '';
  const displayLocation = venueName && venueAddress
    ? `${venueName} - ${venueAddress}`
    : venueAddress || venueName || legacyLocation;
  const mapsQuery = (legacyLocation || `${venueName} ${venueAddress}`).trim();

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

  return (
    <>
      {createPortal(
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
                <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
                  {/* Header */}
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
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

                  {/* Scrollable Content Area */}
                  <div className="flex-1 overflow-y-auto min-h-0">
                    {/* Event Image Thumbnail (clickable to view full size) */}
                    {memoizedEvent.imageUrl && (
                      <div className="relative group cursor-pointer" onClick={handleThumbnailClick}>
                        {/* Thumbnail with max-height constraint */}
                        <div className="relative w-full max-h-64 overflow-hidden bg-gray-100 flex items-center justify-center">
                          <img
                            src={displayUrl}
                            alt={memoizedEvent.title || "Event image"}
                            className="w-full h-auto max-h-64 object-contain"
                            loading="lazy"
                            style={{ 
                              maxHeight: '256px', 
                              maxWidth: '100%',
                              objectFit: 'contain' 
                            }}
                          />
                          {/* Zoom overlay hint */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                            <div className="bg-white/90 rounded-full p-3 shadow-lg">
                              <ZoomIn className="w-6 h-6 text-gray-800" />
                            </div>
                          </div>
                          {/* Click hint text */}
                          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            Click to view full size
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Event Content */}
                    <div className="p-6">
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
                        {displayLocation && (
                          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                            <MapPin className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                            <div>
                              <div className="font-medium text-gray-900">Location</div>
                              {mapsQuery ? (
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-gray-600 hover:text-blue-700 hover:underline"
                                >
                                  {displayLocation}
                                </a>
                              ) : (
                                <div className="text-gray-600">{displayLocation}</div>
                              )}
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
                  </div>

                  {/* Footer Actions */}
                  <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between flex-shrink-0">
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
      )}
      
      {/* Image Lightbox */}
      {memoizedEvent.imageUrl && (
        <EventImageLightbox
          isOpen={isLightboxOpen}
          imageUrl={memoizedEvent.imageUrl}
          alt={memoizedEvent.title || "Event image"}
          onClose={() => setIsLightboxOpen(false)}
        />
      )}
    </>
  );
};
