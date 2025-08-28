import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Calendar, MapPin, Users, Share2, Heart, MessageCircle, Eye, CheckCircle, XCircle, ThumbsUp, ThumbsDown, Clock, Link } from 'lucide-react';
import { format } from 'date-fns';
import { EventDoc } from '../../hooks/useEvents';
import { RSVPModal } from './RSVPModal';
import { EventTeaserModal } from './EventTeaserModal';
import { PastEventModal } from './PastEventModal';
import { useAuth } from '../../contexts/AuthContext';
import { useUserBlocking } from '../../hooks/useUserBlocking';

interface EventCardProps {
  event: EventDoc;
  onEdit?: () => void;
  onClick?: () => void;
}

const EventCard: React.FC<EventCardProps> = ({ event, onEdit, onClick }) => {
  const { currentUser } = useAuth();
  const { blockedUsers } = useUserBlocking();
  const [showRSVPModal, setShowRSVPModal] = useState(false);
  const [showTeaserModal, setShowTeaserModal] = useState(false);
  const [showPastEventModal, setShowPastEventModal] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [rsvpStatus, setRsvpStatus] = useState<'going' | 'not-going' | null>(null);
  
  // Intersection Observer for lazy loading
  const [ref, inView] = useInView({
    threshold: 0.1,
    triggerOnce: true,
    rootMargin: '50px'
  });

  // Cleanup modals when event changes
  useEffect(() => {
    setShowRSVPModal(false);
    setShowTeaserModal(false);
    setShowPastEventModal(false);
  }, [event.id]);

  // Check if user is blocked from RSVP
  const isBlockedFromRSVP = blockedUsers.some(block => 
    block.blockCategory === 'rsvp_only' && block.isActive
  );

  // Add a time-based dependency to update past status in real-time
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, []);

  // Check if event is past (no RSVP allowed for past events)
  const isEventPast = useMemo(() => {
    if (!event.startAt) return false;
    const eventDate = event.startAt.toDate ? event.startAt.toDate() : new Date(event.startAt);
    return eventDate < currentTime;
  }, [event.startAt, currentTime]);

  // Handle card click
  const handleCardClick = () => {
    console.log('🔍 EventCard handleCardClick called for event:', {
      id: event.id,
      title: event.title,
      isEventPast: isEventPast,
      hasOnClick: !!onClick
    });

    // If onClick is provided, use it (for admin edit functionality)
    if (onClick) {
      console.log('🔍 Using onClick handler');
      onClick();
      return;
    }

    // For past events, always show past event modal
    if (isEventPast) {
      console.log('🔍 Opening PastEventModal for past event:', event.title);
      setShowPastEventModal(true);
      return;
    }

    // For non-past events, handle based on user authentication
    if (!currentUser) {
      console.log('🔍 Opening EventTeaserModal for non-authenticated user');
      setShowTeaserModal(true);
    } else {
      console.log('🔍 Opening RSVPModal for authenticated user');
      setShowRSVPModal(true);
    }
  };

  // Handle image load
  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  // Handle image error
  const handleImageError = () => {
    setImageError(true);
    setImageLoaded(false);
  };

  // Quick RSVP handlers
  const handleQuickRSVP = (status: 'going' | 'not-going') => {
    if (isBlockedFromRSVP) return;
    
    setRsvpStatus(status);
    // Here you could integrate with backend to save RSVP
    // For now, just update local state
  };

  // Share event
  const shareEvent = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: event.title,
          text: event.description || `Join us for ${event.title}`,
          url: `${window.location.origin}/events/${event.id}`
        });
      } catch (error) {
        console.log('Error sharing:', error);
      }
    } else {
      // Fallback: copy to clipboard
      const url = `${window.location.origin}/events/${event.id}`;
      await navigator.clipboard.writeText(url);
      // You could show a toast here
    }
    setShareMenuOpen(false);
  };

  // Copy event link
  const copyEventLink = async () => {
    const url = `${window.location.origin}/events/${event.id}`;
    await navigator.clipboard.writeText(url);
    setShareMenuOpen(false);
    // You could show a toast here
  };

  // Toggle like
  const toggleLike = () => {
    setIsLiked(!isLiked);
    // Here you could integrate with a backend to persist likes
  };

  // Calculate event duration
  const getEventDuration = () => {
    if (!event.startAt || !event.endAt) return '';
    
    const start = new Date(event.startAt.seconds * 1000);
    const end = new Date(event.endAt.seconds * 1000);
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

  return (
    <>
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 30
        }}
        whileHover={{ 
          y: isEventPast ? 0 : -4,
          scale: isEventPast ? 1 : 1.01,
          transition: { duration: 0.2 }
        }}
        whileTap={{ scale: 0.98 }}
        className={`group event-card relative bg-white rounded-xl shadow-lg transition-all duration-300 overflow-hidden h-[480px] flex flex-col ${
          isEventPast ? 'opacity-75 grayscale cursor-default hover:shadow-lg' : 'cursor-pointer hover:shadow-2xl'
        }`}
        onClick={handleCardClick}
      >
        {/* Smart Image Section - Only render when image exists */}
        {event.imageUrl && !imageError ? (
          <div className="relative overflow-hidden flex-shrink-0 h-56">
            {inView && (
              <motion.img
                src={event.imageUrl}
                alt={event.title}
                className={`w-full h-full object-cover transition-all duration-500 ${
                  imageLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-110'
                }`}
                onLoad={handleImageLoad}
                onError={handleImageError}
                loading="lazy"
              />
            )}
            
            {/* Loading skeleton */}
            {!imageLoaded && (
              <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 animate-pulse" />
            )}

            {/* Enhanced overlay with quick actions */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                <div className="flex gap-2">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLike();
                    }}
                    className={`p-2 rounded-full transition-all duration-200 ${
                      isLiked 
                        ? 'bg-red-500 text-white shadow-lg' 
                        : 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
                  </motion.button>
                  
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShareMenuOpen(!shareMenuOpen);
                    }}
                    className="p-2 rounded-full bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm transition-all duration-200"
                  >
                    <Share2 className="w-4 h-4" />
                  </motion.button>
                </div>
                
                <div className="flex items-center gap-1 text-white text-sm bg-black/30 px-2 py-1 rounded-full backdrop-blur-sm">
                  <Eye className="w-3 h-3" />
                  <span>{Math.floor(Math.random() * 100) + 50}</span>
                </div>
              </div>
            </div>

            {/* Share Menu */}
            <AnimatePresence>
              {shareMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-4 right-4 bg-white rounded-lg shadow-xl p-2 space-y-1 border border-gray-100 z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={shareEvent}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 rounded transition-colors flex items-center gap-2 text-gray-700 hover:text-purple-600"
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </button>
                  <button
                    onClick={copyEventLink}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 rounded transition-colors flex items-center gap-2 text-gray-700 hover:text-purple-600"
                  >
                    <Link className="w-4 h-4" />
                    Copy Link
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          // Calendar icon placeholder when no image
          <div className="flex-shrink-0 h-24 bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
            <Calendar className="w-12 h-12 text-purple-400" />
          </div>
        )}

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3">
          {/* Event Title */}
          <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-purple-600 transition-colors duration-200">
            {event.title}
          </h3>

          {/* Event Description */}
          {event.description && (
            <p className="text-gray-600 text-sm leading-relaxed mb-3 line-clamp-3">
              {event.description}
            </p>
          )}

          {/* Event Details */}
          <div className="space-y-2 mb-3">
            {/* Date and Duration */}
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="w-4 h-4 text-purple-500" />
              <span>
                {event.startAt ? format(new Date(event.startAt.seconds * 1000), 'EEEE, MMMM d, yyyy') : 'Date TBD'}
                {getEventDuration() && <span className="text-gray-500 ml-1">{getEventDuration()}</span>}
              </span>
            </div>

            {/* Location */}
            {event.location && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <MapPin className="w-4 h-4 text-red-500" />
                <span>{event.location}</span>
              </div>
            )}

            {/* Capacity */}
            {event.maxAttendees && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Users className="w-4 h-4 text-blue-500" />
                <span>Capacity: {event.maxAttendees} attendees</span>
              </div>
            )}

            {/* Tags */}
            {event.tags && event.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {event.tags.slice(0, 3).map((tag, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full font-medium"
                  >
                    #{tag}
                  </span>
                ))}
                {event.tags.length > 3 && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                    +{event.tags.length - 3} more
                  </span>
                )}
              </div>
            )}

            {/* Past Event Notice */}
            {isEventPast && (
              <div className="mb-3 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium">Event ended</span>
                </div>
                {event.endAt && (
                  <p className="text-xs text-gray-500 mt-1">
                    Ended: {format(new Date(event.endAt.seconds * 1000), 'MMM dd, yyyy h:mm a')}
                  </p>
                )}
              </div>
            )}

            {/* Quick RSVP Status Icons with Going Count and Share - All in one row */}
            {currentUser && !isBlockedFromRSVP && !isEventPast && (
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickRSVP('going');
                      }}
                      className={`p-2 rounded-full transition-all duration-200 ${
                        rsvpStatus === 'going'
                          ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
                          : 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-600 hover:from-green-100 hover:to-emerald-100 border border-green-200 hover:border-green-300'
                      }`}
                      title="Going"
                    >
                      <ThumbsUp className="w-4 h-4" />
                    </motion.button>
                    
                    {/* Going count next to the going icon */}
                    <span className="flex items-center gap-1 text-xs text-purple-600 font-semibold bg-purple-100 px-2 py-1 rounded-full border border-purple-200">
                      <Users className="w-3 h-3" />
                      {Math.floor(Math.random() * 15) + 3}
                    </span>
                  </div>
                  
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQuickRSVP('not-going');
                    }}
                    className={`p-2 rounded-full transition-all duration-200 ${
                      rsvpStatus === 'not-going'
                        ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg'
                        : 'bg-gradient-to-r from-red-50 to-rose-50 text-red-600 hover:from-red-100 hover:to-rose-100 border border-red-200 hover:border-red-300'
                    }`}
                    title="Not Going"
                  >
                    <ThumbsDown className="w-4 h-4" />
                  </motion.button>
                </div>
                
                {/* Share button - aligned to the right in the same row */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShareMenuOpen(!shareMenuOpen);
                  }}
                  className="p-2 text-purple-600 hover:text-purple-700 hover:bg-gradient-to-r hover:from-purple-50 hover:to-blue-50 rounded-full transition-all duration-200 border border-purple-200 hover:border-purple-300"
                  title="Share Event"
                >
                  <Share2 className="w-4 h-4" />
                </motion.button>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons - Pushed to bottom */}
        <div className="mt-auto pt-3 border-t border-gray-100 flex-shrink-0 px-4 pb-3">
          <div className="flex gap-3">
            {currentUser ? (
              isEventPast ? (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={true}
                  className="flex-1 px-3 py-2 bg-gray-300 text-gray-500 rounded-lg font-medium text-sm cursor-not-allowed"
                >
                  Event Ended
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRSVPModal(true);
                  }}
                  disabled={isBlockedFromRSVP}
                  className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                    isBlockedFromRSVP
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:from-purple-700 hover:to-purple-800 hover:shadow-lg'
                  }`}
                >
                  {isBlockedFromRSVP ? 'RSVP Blocked' : 'RSVP Details'}
                </motion.button>
              )
            ) : (
              isEventPast ? (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={true}
                  className="flex-1 px-3 py-2 bg-gray-300 text-gray-500 rounded-lg font-medium text-sm cursor-not-allowed"
                >
                  Event Ended
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTeaserModal(true);
                  }}
                  className="flex-1 px-3 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg font-medium text-sm hover:from-purple-700 hover:to-purple-800 hover:shadow-lg transition-all duration-200"
                >
                  View Details
                </motion.button>
              )
            )}

            {currentUser?.role === 'admin' && onEdit && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="px-3 py-2 border-2 border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 hover:border-purple-400 transition-all duration-200 font-medium text-sm"
              >
                Edit
              </motion.button>
            )}
          </div>
        </div>
        

      </motion.div>

      {/* RSVP Modal - Only show for non-past events */}
      {showRSVPModal && !isEventPast && (
        <RSVPModal
          open={showRSVPModal}
          event={event}
          onClose={() => setShowRSVPModal(false)}
          onRSVPUpdate={() => {
            setShowRSVPModal(false);
            // You could trigger a refresh here
          }}
        />
      )}

      {/* Event Teaser Modal - Only show for non-past events */}
      {showTeaserModal && !isEventPast && (
        <EventTeaserModal
          open={showTeaserModal}
          event={event}
          onClose={() => setShowTeaserModal(false)}
        />
      )}

      {/* Past Event Modal - Only show for past events */}
      {showPastEventModal && isEventPast && (
        <PastEventModal
          open={showPastEventModal}
          event={event}
          onClose={() => setShowPastEventModal(false)}
        />
      )}
    </>
  );
};

export default EventCard;