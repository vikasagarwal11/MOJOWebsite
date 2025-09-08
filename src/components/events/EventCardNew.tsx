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
import { getEventAttendeeCount } from '../../services/attendeeService';
import toast from 'react-hot-toast';

interface EventCardProps {
  event: EventDoc;
  onEdit?: () => void;
  onClick?: () => void;
}

const EventCardNew: React.FC<EventCardProps> = ({ event, onEdit, onClick }) => {
  const { currentUser } = useAuth();
  const { blockedUsers } = useUserBlocking();
  const { attendees, counts, addAttendee, setAttendeeStatus, refreshAttendees } = useAttendees(event.id, currentUser?.id || '');
  
  // State
  const [showRSVPModal, setShowRSVPModal] = useState(false);
  const [showTeaserModal, setShowTeaserModal] = useState(false);
  const [showPastEventModal, setShowPastEventModal] = useState(false);
  const [rsvpStatus, setRsvpStatus] = useState<'going' | 'not-going' | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [totalAttendeeCount, setTotalAttendeeCount] = useState<number>(0);
  
  // Overflow detection for description
  const descRef = useRef<HTMLParagraphElement | null>(null);
  const [isClamped, setIsClamped] = useState(false);
  
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

  // Function to refresh total attendee count
  const refreshTotalAttendeeCount = async () => {
    try {
      console.log('🔍 DEBUG: Refreshing total attendee count for event:', event.id);
      const count = await getEventAttendeeCount(event.id);
      console.log('🔍 DEBUG: Total attendee count updated to:', count);
      setTotalAttendeeCount(count);
    } catch (error) {
      console.error('Failed to fetch total attendee count:', error);
      setTotalAttendeeCount(0);
    }
  };

  // Fetch total attendee count for the event
  useEffect(() => {
    refreshTotalAttendeeCount();
  }, [event.id]);

  // Overflow detection for description
  useEffect(() => {
    const el = descRef.current;
    if (!el) return;

    const check = () => setIsClamped(el.scrollHeight > el.clientHeight + 1);
    check();

    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(check);
      ro.observe(el);
      return () => ro.disconnect();
    } else {
      // Fallback for older browsers
      (window as any).addEventListener('resize', check);
      return () => (window as any).removeEventListener('resize', check);
    }
  }, [event.description]);

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

  // Handle view event details click
  const handleViewEventDetails = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    console.log('🔍 View Event Details clicked for event:', {
      id: event.id,
      title: event.title,
      isEventPast: isEventPast,
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
      currentRSVPStatus: rsvpStatus,
      currentTotalCount: totalAttendeeCount
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
         
        // If primary member is changing to "not-going", update all family members to "not-going" as well
        if (status === 'not-going') {
          console.log('🔍 DEBUG: Primary member is not going, updating all family members to not-going');
          const familyMembers = attendees.filter(a => 
            a.userId === currentUser.id && 
            a.attendeeType === 'family_member' && 
            a.rsvpStatus === 'going'
          );
          
          for (const familyMember of familyMembers) {
            console.log('🔍 DEBUG: Updating family member to not-going:', familyMember.name);
            await setAttendeeStatus(familyMember.attendeeId, 'not-going');
          }
          
          if (familyMembers.length > 0) {
            toast.success(`${familyMembers.length} family member${familyMembers.length > 1 ? 's' : ''} automatically marked as "Not Going" since you cannot attend.`);
          }
        }
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
       
       // Add a small delay to ensure Firestore update has propagated
       await new Promise(resolve => setTimeout(resolve, 500));
       
               // Refresh total attendee count immediately after RSVP action
        console.log('🔍 DEBUG: About to refresh total attendee count...');
        await refreshTotalAttendeeCount();
        
        console.log('🔍 DEBUG: Quick RSVP completed successfully. New total count should be updated.');
      
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
    // Refresh total attendee count
    refreshTotalAttendeeCount();
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

  // Calculate event duration in hours
  const getEventDuration = () => {
    if (!event.startAt || !event.endAt) return null;
    
    const startDate = event.startAt.toDate ? event.startAt.toDate() : new Date(event.startAt);
    const endDate = event.endAt.toDate ? event.endAt.toDate() : new Date(event.endAt);
    
    const durationMs = endDate.getTime() - startDate.getTime();
    const durationHours = Math.round(durationMs / (1000 * 60 * 60) * 10) / 10; // Round to 1 decimal place
    
    return durationHours;
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
                                                                                         className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100 h-[460px] sm:h-[480px] md:h-[500px] lg:h-[520px] xl:h-[540px] flex flex-col mb-4 scroll-mt-20"
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
             <div className="w-full h-full bg-gradient-to-br from-[#F25129]/10 to-[#FF6B35]/10 flex items-center justify-center">
               <Calendar className="w-8 h-8 text-[#F25129]/60" />
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
             className="absolute top-3 right-3 p-2 bg-white/90 backdrop-blur-sm text-gray-700 hover:text-[#F25129] hover:bg-white rounded-lg transition-all duration-200 shadow-lg"
             title="Share event"
           >
             <Share2 className="w-4 h-4" />
           </motion.button>
         </div>

        {/* Event Content - Flex to fill remaining space */}
        <div className="p-6 flex flex-col flex-1">
                     {/* Event Title - More space for longer titles */}
           <h3 className="text-xl font-bold text-gray-900 mb-3 line-clamp-1 sm:line-clamp-2 md:line-clamp-2 h-[32px] sm:h-[48px] md:h-[56px] flex items-start">
             {event.title}
           </h3>

                                                                                                                                                                                                                                                                                                                                                               {/* Event Description - Adjusted height to compensate for title */}
             <div className="mb-4 relative flex flex-col min-h-[64px] sm:min-h-[80px] md:min-h-[96px]">
               {(() => {
                 const hasDesc = !!event.description?.trim();
                 return hasDesc ? (
                   <>
                     <p
                       ref={descRef}
                       className="text-gray-600 text-sm md:text-base leading-5 md:leading-6 line-clamp-2 md:line-clamp-3 overflow-hidden"
                     >
                       {event.description}
                     </p>

                     {/* Fade above the reserved link row */}
                     {isClamped && (
                       <div className="pointer-events-none absolute inset-x-0 bottom-6 h-6 bg-gradient-to-t from-white to-transparent" />
                     )}

                     {/* Reserve the link row height always */}
                     <div className="mt-1 self-end h-6 flex items-center">
                       {isClamped && (
                         <button
                           type="button"
                           onClick={handleViewEventDetails}
                           role="link"
                           aria-label={`View details for ${event.title}`}
                           className="text-[#F25129] hover:text-[#E0451F] font-medium hover:underline bg-white px-1 rounded focus:outline-none focus:ring-2 focus:ring-[#F25129]/40 whitespace-nowrap"
                           onKeyDown={(e) => {
                             if (e.key === 'Enter' || e.key === ' ') handleViewEventDetails(e);
                           }}
                         >
                           View details…
                         </button>
                       )}
                     </div>
                   </>
                 ) : (
                   <p className="text-gray-400 italic text-sm h-full flex items-center">
                     No description available
                   </p>
                 );
               })()}
             </div>

                                           {/* Event Details - Adaptive height */}
            <div className="space-y-1.5 mb-3 h-[120px] sm:h-[130px] md:h-[140px] lg:h-[150px] xl:h-[160px]">
            {/* Date - Only show start date */}
            <div className="flex items-center text-gray-600">
              <Calendar className="w-4 h-4 mr-2 text-[#F25129]" />
              <span>{formatEventDate(event.startAt)}</span>
            </div>

            {/* Time with duration */}
            {event.startAt && (
              <div className="flex items-center text-gray-600">
                <Clock className="w-4 h-4 mr-2 text-[#F25129]" />
                <span>
                  {formatEventTime(event.startAt)}
                  {event.endAt && ` - ${formatEventTime(event.endAt)}`}
                  {(() => {
                    const duration = getEventDuration();
                    return duration ? ` (${duration} hours)` : '';
                  })()}
                </span>
              </div>
            )}

            {/* Location */}
            {(event.venueName || event.venueAddress || event.location) && (
              <div className="flex items-start text-gray-600">
                <MapPin className="w-4 h-4 mr-2 text-[#F25129] mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  {event.venueName && (
                    <div className="font-medium line-clamp-1">{event.venueName}</div>
                  )}
                  {event.venueAddress && (
                    <div className="text-xs opacity-75 line-clamp-1">{event.venueAddress}</div>
                  )}
                  {!event.venueName && !event.venueAddress && event.location && (
                    <div className="line-clamp-1">{event.location}</div>
                  )}
                </div>
              </div>
            )}

            {/* Attendee Count */}
            <div className="flex items-center text-gray-600">
              <Users className="w-4 h-4 mr-2 text-[#F25129]" />
              <span>
                {totalAttendeeCount} attending
                {event.maxAttendees && ` / ${event.maxAttendees} max`}
              </span>
            </div>
          </div>

          {/* Action Buttons - Always at bottom */}
          <div className="flex items-center justify-between mt-auto pt-2 pb-4 relative z-10" style={{ minHeight: '60px' }}>
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
                 className={`flex items-center gap-1 px-2 py-2 rounded-lg font-medium transition-all duration-200 text-xs relative z-50 pointer-events-auto ${
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
                 className={`flex items-center gap-1 px-2 py-2 rounded-lg font-medium transition-all duration-200 text-xs relative z-50 pointer-events-auto ${
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
                className="p-2 bg-[#F25129]/10 text-[#F25129] hover:bg-[#F25129]/20 rounded-lg transition-colors"
                title="Manage RSVP details"
              >
                <div className="relative">
                  <Users className="w-4 h-4" />
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#F25129] rounded-full flex items-center justify-center">
                    <span className="text-white text-[8px] font-bold leading-none">+</span>
                  </div>
                </div>
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
