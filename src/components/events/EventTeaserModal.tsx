import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Calendar, MapPin, Clock, Users, Star, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { EventDoc } from '../../hooks/useEvents';

interface EventTeaserModalProps {
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

export const EventTeaserModal: React.FC<EventTeaserModalProps> = ({ open, event, onClose }) => {
  if (!open || !event) return null;

  // Add keyboard support for closing modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (open) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [open, onClose]);

  // Format event date and calculate duration
  const eventDate = event.startAt ? new Date(event.startAt.seconds * 1000) : new Date();
  const eventEndDate = event.endAt ? new Date(event.endAt.seconds * 1000) : null;
  
  const formattedDate = format(eventDate, 'EEEE, MMMM d, yyyy');
  const formattedTime = format(eventDate, 'h:mm a');
  
  // Calculate and format duration
  const formatDuration = () => {
    if (!eventEndDate) return null;
    
    const diffMs = eventEndDate.getTime() - eventDate.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;
    
    if (diffDays > 0) {
      if (remainingHours > 0) {
        return `(${diffDays} day${diffDays > 1 ? 's' : ''} ${remainingHours} hour${remainingHours > 1 ? 's' : ''})`;
      } else {
        return `(${diffDays} day${diffDays > 1 ? 's' : ''})`;
      }
    } else if (diffHours > 0) {
      return `(${diffHours} hour${diffHours > 1 ? 's' : ''})`;
    } else {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `(${diffMinutes} minute${diffMinutes > 1 ? 's' : ''})`;
    }
  };
  
  const durationText = formatDuration();

  const modal = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[999] flex items-center justify-center p-4"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          
          {/* Modal */}
          <motion.div
            className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Header - Reduced height */}
            <div className="bg-gradient-to-r from-[#F25129] to-[#FF6B35] text-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-bold">{event.title}</h2>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClose();
                  }}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Event Info - Compact layout */}
              <div className="space-y-2">
                {/* Date and Time - Single row */}
                <div className="flex items-center gap-4 text-white/80 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{formattedDate}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>{formattedTime}</span>
                    {eventEndDate && (
                      <span className="text-white/70">
                        - {format(eventEndDate, 'h:mm a')}
                      </span>
                    )}
                    {durationText && <span className="text-white/70">{durationText}</span>}
                  </div>
                </div>
                
                {/* Location - Inline with smaller font */}
                {event.location && (
                  <div className="flex items-center gap-2 text-white/70 text-xs">
                    <MapPin className="w-3 h-3" />
                    <span>{event.location}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Event Image - Only show when image exists */}
            {event.imageUrl && (
              <div className="relative w-full h-80 overflow-hidden bg-gradient-to-br from-[#F25129]/10 to-[#FF6B35]/10 flex items-center justify-center">
                <motion.img
                  src={event.imageUrl}
                  alt={event.title}
                  className="w-full h-full object-contain"
                  initial={{ scale: 1.05, opacity: 0.8 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  onError={(e) => {
                    // Hide image if it fails to load
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
                {/* Enhanced overlay for better visual appeal */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />
              </div>
            )}

            {/* Event Description */}
            <div className="p-3">
              <div className="space-y-2.5">
                {/* Impressive Title with Event Description */}
                <div className="text-center mb-3">
                  <h3 className="text-lg font-bold text-gray-900 mb-1.5">Discover Your Next Adventure</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {event.description || 'Join us for an exciting fitness event! More details available to members.'}
                  </p>
                </div>

                {/* Event Tags */}
                {event.tags && event.tags.length > 0 && (
                  <div>
                    <h5 className="text-xs font-medium text-gray-700 mb-1.5">Event Categories</h5>
                    <div className="flex flex-wrap gap-1.5">
                      {event.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-2 py-0.5 bg-[#F25129]/10 text-[#F25129] text-xs rounded-full border border-[#F25129]/20"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Capacity Info */}
                {event.maxAttendees && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Users className="w-3 h-3" />
                    <span>Capacity: {event.maxAttendees} attendees</span>
                  </div>
                )}

                {/* Call-to-Action - Optimized and Compact */}
                <div className="p-3 bg-gradient-to-r from-[#F25129]/10 to-[#FF6B35]/10 border border-[#F25129]/20 rounded-lg">
                  <div className="flex items-start gap-2.5">
                    <Star className="w-4 h-4 text-[#F25129] mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h5 className="font-semibold text-[#F25129] text-sm mb-1">Ready to Join?</h5>
                      <p className="text-xs text-[#F25129]/80 mb-2.5 leading-tight">
                        Sign up for a free account to RSVP and join our fitness community!
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            // Navigate to signup page
                            window.location.href = '/register';
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#F25129] text-white text-xs font-medium rounded-md hover:bg-[#E0451F] transition-all duration-200 hover:scale-105"
                        >
                          Join Community
                          <ArrowRight className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => {
                            // Navigate to login page
                            window.location.href = '/login';
                          }}
                          className="px-2.5 py-1.5 text-[#F25129] border border-[#F25129] text-xs font-medium rounded-md hover:bg-[#F25129]/10 transition-all duration-200"
                        >
                          Sign In
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Render above everything else using createPortal
  return ReactDOM.createPortal(modal, document.body);
};
