import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Calendar, MapPin, Users, Share2, Heart, MessageCircle, Eye, CheckCircle, XCircle, ThumbsUp, ThumbsDown, Clock, Link, Edit, Settings, UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { EventDoc } from '../../hooks/useEvents';
import { RSVPModalNew as RSVPModal } from './RSVPModalNew';
import { EventTeaserModal } from './EventTeaserModal';
import { PastEventModal } from './PastEventModal';
import { useAuth } from '../../contexts/AuthContext';
import { useUserBlocking } from '../../hooks/useUserBlocking';

import { useAttendees } from '../../hooks/useAttendees';
import { doc, setDoc, updateDoc, getDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { CreateAttendeeData, AttendeeStatus } from '../../types/attendee';

interface EventCardProps {
  event: EventDoc;
  onEdit?: () => void;
  onClick?: () => void;
}

const EventCardNew: React.FC<EventCardProps> = ({ event, onEdit, onClick }) => {
  const { currentUser } = useAuth();
  const { blockedUsers } = useUserBlocking();
  const { attendees, counts, addAttendee, setAttendeeStatus, refreshAttendees } = useAttendees(event.id);
  
  // State
  const [showRSVPModal, setShowRSVPModal] = useState(false);
  const [showTeaserModal, setShowTeaserModal] = useState(false);
  const [showPastEventModal, setShowPastEventModal] = useState(false);
  const [rsvpStatus, setRsvpStatus] = useState<'going' | 'not-going' | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  
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

  // Sync RSVP status from attendees
  useEffect(() => {
    if (currentUser && attendees.length > 0) {
      const userAttendee = attendees.find(a => a.userId === currentUser.id && a.attendeeType === 'primary');
      const status = userAttendee ? userAttendee.rsvpStatus : null;
      // Only set status if it's 'going' or 'not-going', filter out 'pending'
      if (status === 'going' || status === 'not-going') {
        setRsvpStatus(status);
      } else {
        setRsvpStatus(null);
      }
    } else if (currentUser) {
      setRsvpStatus(null);
    }
  }, [currentUser, event.id, attendees]);



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
      hasOnClick: !!onClick,
      currentUser: currentUser?.id
    });
    
    if (onClick) {
      onClick();
    } else if (isEventPast) {
      setShowPastEventModal(true);
    } else if (currentUser) {
      // User is logged in - show RSVP modal for event management
      setShowRSVPModal(true);
    } else {
      // User is not logged in - show teaser modal
      setShowTeaserModal(true);
    }
  };

  // Quick RSVP handlers using new attendee system
  const handleQuickRSVP = async (status: AttendeeStatus) => {
    if (isBlockedFromRSVP || !currentUser || isEventPast) return;
    
    console.log('🔍 DEBUG: Quick RSVP started with new attendee system:', {
      status,
      eventId: event.id,
      currentUser: currentUser.id,
      currentRSVPStatus: rsvpStatus
    });
    
    setIsUpdating(true);
    
    try {
      // Check if user already has a primary attendee record
      const existingAttendee = attendees.find(a => 
        a.userId === currentUser.id && a.attendeeType === 'primary'
      );
      
      if (existingAttendee) {
        // Update existing attendee status
        console.log('🔍 DEBUG: Updating existing primary attendee status to:', status);
        await setAttendeeStatus(existingAttendee.attendeeId, status);
      } else {
        // Create new primary attendee
        console.log('🔍 DEBUG: Creating new primary attendee with status:', status);
        const attendeeData: CreateAttendeeData = {
          eventId: event.id,
          userId: currentUser.id,
          attendeeType: 'primary',
          relationship: 'self',
          name: currentUser.displayName || 'Primary User',
          ageGroup: '11+',
          rsvpStatus: status
        };
        
        await addAttendee(attendeeData);
      }
      
      // Update local state - only set if status is 'going' or 'not-going'
      if (status === 'going' || status === 'not-going') {
        setRsvpStatus(status);
      }
      
      // Refresh attendees to get updated counts
      await refreshAttendees();
      
      console.log('🔍 DEBUG: Quick RSVP completed successfully');
      
    } catch (error) {
      console.error('❌ Error in quick RSVP:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle RSVP modal close
  const handleRSVPModalClose = () => {
    console.log('🔍 RSVP Modal closing');
    setShowRSVPModal(false);
    // Refresh data when modal closes
    refreshAttendees();
  };

  // Handle RSVP modal open
  const handleRSVPModalOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('🔍 RSVP Modal opening for event:', event.id);
    setShowRSVPModal(true);
  };

  // Handle share
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: event.title,
          text: event.description || 'Check out this event!',
          url: window.location.href
        });
      } catch (error) {
        console.log('Share cancelled or failed');
      }
    } else {
      // Fallback to copying to clipboard
      try {
        await navigator.clipboard.writeText(window.location.href);
        // You could show a toast notification here
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
      }
    }
  };

  // Format event date
  const formatEventDate = (date: any) => {
    if (!date) return 'Date TBD';
    const eventDate = date.toDate ? date.toDate() : new Date(date);
    return format(eventDate, 'MMM dd, yyyy');
  };

  // Format event time
  const formatEventTime = (date: any) => {
    if (!date) return '';
    const eventDate = date.toDate ? date.toDate() : new Date(date);
    return format(eventDate, 'h:mm a');
  };

  // Get RSVP button state
  const getRSVPButtonState = () => {
    if (isEventPast) return 'disabled';
    if (isBlockedFromRSVP) return 'blocked';
    if (isUpdating) return 'loading';
    return 'active';
  };

  // Get button disable state
  const isGoingButtonDisabled = rsvpStatus === 'going' || getRSVPButtonState() !== 'active';
  const isNotGoingButtonDisabled = rsvpStatus === 'not-going' || getRSVPButtonState() !== 'active';

  return (
    <>
             <motion.div
         ref={ref}
         layout
         initial={{ opacity: 0, y: 20 }}
         animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
         transition={{ duration: 0.5 }}
                   className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100 h-[450px] md:h-[500px] flex flex-col"
         onClick={handleCardClick}
       >
                 {/* Event Image - Always show image section for consistent height */}
         <div className="relative h-48 overflow-hidden">
           {event.imageUrl ? (
             <img
               src={event.imageUrl}
               alt={event.title}
               className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
             />
           ) : (
             <div className="w-full h-full bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
               <Calendar className="w-8 h-8 text-purple-300" />
             </div>
           )}
           
           {/* Share Button - Top Right Corner */}
           <motion.button
             whileHover={{ scale: 1.05 }}
             whileTap={{ scale: 0.95 }}
             onClick={(e) => {
               e.stopPropagation();
               handleShare();
             }}
             className="absolute top-3 right-3 p-2 bg-white/90 backdrop-blur-sm text-gray-700 hover:text-blue-600 hover:bg-white rounded-lg transition-all duration-200 shadow-lg"
             title="Share event"
           >
             <Share2 className="w-4 h-4" />
           </motion.button>
         </div>

        {/* Event Content - Flex to fill remaining space */}
        <div className="p-6 flex flex-col flex-1">
                     {/* Event Title - More space for longer titles */}
           <h3 className="text-xl font-bold text-gray-900 mb-3 line-clamp-1 md:line-clamp-2 h-[32px] md:h-[56px] flex items-start">
             {event.title}
           </h3>

                     {/* Event Description - Adjusted height to compensate for title */}
           <div className="mb-4 h-[60px] md:h-[72px]">
             {event.description ? (
               <p className="text-gray-600 line-clamp-2 md:line-clamp-3 h-full">
                 {event.description}
               </p>
             ) : (
               <p className="text-gray-400 italic text-sm h-full flex items-center">
                 No description available
               </p>
             )}
           </div>

                     {/* Event Details - Adaptive height */}
           <div className="space-y-2 mb-4 h-[100px] md:h-[120px]">
            {/* Date & Time */}
            <div className="flex items-center text-gray-600">
              <Calendar className="w-4 h-4 mr-2 text-purple-500" />
              <span>{formatEventDate(event.startAt)}</span>
              {event.startAt && event.endAt && (
                <span className="mx-2">•</span>
              )}
              {event.endAt && (
                <span>{formatEventDate(event.endAt)}</span>
              )}
            </div>

            {/* Time */}
            {event.startAt && (
              <div className="flex items-center text-gray-600">
                <Clock className="w-4 h-4 mr-2 text-purple-500" />
                <span>
                  {formatEventTime(event.startAt)}
                  {event.endAt && ` - ${formatEventTime(event.endAt)}`}
                </span>
              </div>
            )}

            {/* Location */}
            {event.location && (
              <div className="flex items-center text-gray-600">
                <MapPin className="w-4 h-4 mr-2 text-purple-500" />
                <span className="line-clamp-1">{event.location}</span>
              </div>
            )}

            {/* Attendee Count */}
            <div className="flex items-center text-gray-600">
              <Users className="w-4 h-4 mr-2 text-purple-500" />
              <span>
                {counts.totalGoing} attending
                {event.maxAttendees && ` / ${event.maxAttendees} max`}
              </span>
            </div>
          </div>

          {/* Action Buttons - Always at bottom */}
          <div className="flex items-center justify-between mt-auto">
            {/* Quick RSVP Buttons - Made much smaller to fit Manage button */}
            <div className="flex gap-1 flex-1">
              {/* Going Button */}
              <motion.button
                whileHover={!isGoingButtonDisabled ? { scale: 1.05 } : {}}
                whileTap={!isGoingButtonDisabled ? { scale: 0.95 } : {}}
                onClick={(e) => {
                  e.stopPropagation();
                  handleQuickRSVP('going');
                }}
                disabled={isGoingButtonDisabled}
                className={`flex items-center gap-1 px-2 py-2 rounded-lg font-medium transition-all duration-200 text-xs ${
                  rsvpStatus === 'going'
                    ? 'bg-green-100 text-green-700 cursor-not-allowed'
                    : isGoingButtonDisabled
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {isUpdating ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                ) : (
                  <ThumbsUp className="w-3 h-3" />
                )}
                Going
              </motion.button>

              {/* Not Going Button */}
              <motion.button
                whileHover={!isNotGoingButtonDisabled ? { scale: 1.05 } : {}}
                whileTap={!isNotGoingButtonDisabled ? { scale: 0.95 } : {}}
                onClick={(e) => {
                  e.stopPropagation();
                  handleQuickRSVP('not-going');
                }}
                disabled={isNotGoingButtonDisabled}
                className={`flex items-center gap-1 px-2 py-2 rounded-lg font-medium transition-all duration-200 text-xs ${
                  rsvpStatus === 'not-going'
                    ? 'bg-red-100 text-red-700 cursor-not-allowed'
                    : isNotGoingButtonDisabled
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {isUpdating ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                ) : (
                  <ThumbsDown className="w-3 h-3" />
                )}
                Can't Go
              </motion.button>
            </div>

            {/* Additional Actions - Now visible with icon-only Manage button */}
            <div className="flex items-center gap-1 ml-2">
              {/* RSVP Modal Button - Icon only to save space */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleRSVPModalOpen}
                disabled={isEventPast}
                className="p-2 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg transition-colors"
                title="Manage RSVP details"
              >
                <UserPlus className="w-4 h-4" />
              </motion.button>

              

              {/* Edit Button (Admin Only) */}
              {currentUser?.role === 'admin' && onEdit && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                  title="Edit event"
                >
                  <Edit className="w-4 h-4" />
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Modals */}
      <AnimatePresence>
        {showRSVPModal && (
          <>
            {console.log('🔍 Rendering RSVP Modal for event:', event.id)}
            <RSVPModal
              event={event}
              onClose={handleRSVPModalClose}
              onAttendeeUpdate={refreshAttendees}
            />
          </>
        )}
        
        {showTeaserModal && (
          <EventTeaserModal
            open={showTeaserModal}
            event={event}
            onClose={() => setShowTeaserModal(false)}
          />
        )}
        
        {showPastEventModal && (
          <PastEventModal
            open={showPastEventModal}
            event={event}
            onClose={() => setShowPastEventModal(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default EventCardNew;
