import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Calendar, MapPin, Users, Share2, ThumbsUp, ThumbsDown, Clock, Edit } from 'lucide-react';
import { format } from 'date-fns';
import { EventDoc } from '../../hooks/useEvents';
import { RSVPModalNew as RSVPModal } from './RSVPModalNew';
import { EventTeaserModal } from './EventTeaserModal';
import { PastEventModal } from './PastEventModal';
import { useAuth } from '../../contexts/AuthContext';
import { useUserBlocking } from '../../hooks/useUserBlocking';

import { useAttendees } from '../../hooks/useAttendees';
import { CreateAttendeeData, AttendeeStatus } from '../../types/attendee';
import { useCapacityState } from './RSVPModalNew/hooks/useCapacityState';
import { useWaitlistPositions } from '../../hooks/useWaitlistPositions';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
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
  
  // Real-time attending count state - initialize with current event count
  const [realTimeAttendingCount, setRealTimeAttendingCount] = useState<number>(event.attendingCount || 0);
  
  // Sync with event prop changes (in case parent updates the event)
  useEffect(() => {
    setRealTimeAttendingCount(event.attendingCount || 0);
  }, [event.attendingCount]);
  
  // Real-time listener for event document changes (attendingCount)
  useEffect(() => {
    if (!event.id) return;

    const eventRef = doc(db, 'events', event.id);
    const unsubscribe = onSnapshot(eventRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const newCount = data.attendingCount || 0;
        console.log('🔄 EventCardNew: Checking count update:', { 
          eventId: event.id, 
          currentState: realTimeAttendingCount, 
          newCount,
          eventPropCount: event.attendingCount,
          shouldUpdate: newCount !== realTimeAttendingCount
        });
        
        // Always update if the count is different, regardless of current state
        setRealTimeAttendingCount(newCount);
        console.log('🔄 EventCardNew: Real-time attendingCount updated:', { 
          eventId: event.id, 
          oldCount: realTimeAttendingCount, 
          newCount,
          timestamp: new Date().toISOString()
        });
      }
    }, (error) => {
      console.error('EventCardNew: Error listening to event changes:', error);
    });

    return () => unsubscribe();
  }, [event.id]); // Only depend on event.id
  
  // Create capacity state for this event using real-time count
  const mockCountsWithRealTime = useMemo(() => ({
    ...counts,
    totalGoing: realTimeAttendingCount,
    goingCount: realTimeAttendingCount
  }), [counts, realTimeAttendingCount]);
  
  const capacityState = useCapacityState(mockCountsWithRealTime, event.maxAttendees, event.waitlistEnabled, event.waitlistLimit);
  
  // Real-time waitlist positions
  const { myPosition: waitlistPosition } = useWaitlistPositions(event.id, currentUser?.id);

  // Smart display logic for venue information
  const getDisplayVenueInfo = (venueName: string, venueAddress: string, isMobile: boolean) => {
    if (!venueAddress && !venueName) return 'TBD';
    
    // If we have both venue name and address
    if (venueName && venueAddress) {
      if (isMobile) {
        // Mobile: Prioritize address, show venue name if space permits
        return venueAddress;
      } else {
        // Desktop: Show venue name + address
        return `${venueName} - ${venueAddress}`;
      }
    }
    
    // Fallback to whatever is available
    return venueAddress || venueName;
  };
  
  // State
  const [showRSVPModal, setShowRSVPModal] = useState(false);
  const [showTeaserModal, setShowTeaserModal] = useState(false);
  const [showPastEventModal, setShowPastEventModal] = useState(false);
  const [rsvpStatus, setRsvpStatus] = useState<'going' | 'not-going' | 'waitlisted' | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
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

  // Real-time listener temporarily disabled to fix temporal dead zone error
  // TODO: Re-enable after fixing the underlying React setState issue
  // useEffect(() => {
  //   if (!event.id) return;

  //   const eventRef = doc(db, 'events', event.id);
  //   const unsubscribe = onSnapshot(eventRef, (doc) => {
  //     if (doc.exists()) {
  //       const data = doc.data();
  //       const newCount = data.attendingCount || 0;
  //       setRealTimeAttendingCount(newCount);
  //       console.log('🔄 Real-time attendingCount updated:', { eventId: event.id, newCount });
  //     }
  //   }, (error) => {
  //     console.error('Error listening to event changes:', error);
  //   });

  //   return () => unsubscribe();
  // }, [event.id]);

  // Use real-time attending count
  const totalAttendeeCount = realTimeAttendingCount;
  
  // Debug: Log when component renders with new count
  useEffect(() => {
    console.log('🔄 EventCardNew: Component rendered with count:', {
      eventId: event.id,
      realTimeAttendingCount,
      totalAttendeeCount,
      eventAttendingCount: event.attendingCount
    });
  }, [realTimeAttendingCount, event.id, event.attendingCount]);

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
      // Set status for going, not-going, and waitlisted
      if (status === 'going' || status === 'not-going' || status === 'waitlisted') {
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
    if (isBlockedFromRSVP || isEventPast) return;
    
    // If user is not logged in, show teaser modal
    if (!currentUser) {
      setShowTeaserModal(true);
      return;
    }

    // Check capacity for 'going' status and handle waitlist
    let finalStatus = status;
    if (status === 'going' && !capacityState.canAddMore) {
      if (capacityState.canWaitlist) {
        // Auto-waitlist for quick RSVP
        finalStatus = 'waitlisted';
        // Calculate position (current waitlist count + 1)
        const position = capacityState.waitlistCount + 1;
        toast.success(`Event is full. You're #${position} on the waitlist!`);
      } else {
        toast.error('Event is at full capacity. No more RSVPs can be accepted.');
        return;
      }
    }
    
    console.log('🔍 DEBUG: Quick RSVP started with new attendee system:', {
      originalStatus: status,
      finalStatus: finalStatus,
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
        console.log('🔍 DEBUG: Updating existing primary attendee status to:', finalStatus);
        await setAttendeeStatus(existingAttendee.attendeeId, finalStatus);
         
        // If primary member is changing to "not-going", update all family members to "not-going" as well
        if (finalStatus === 'not-going') {
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
        console.log('🔍 DEBUG: Creating new primary attendee with status:', finalStatus);
        const attendeeData: CreateAttendeeData = {
          eventId: event.id,
          userId: currentUser.id,
          attendeeType: 'primary',
          relationship: 'self',
          name: currentUser.displayName || 'Primary User',
          ageGroup: 'adult',
          rsvpStatus: finalStatus
        };
        
        await addAttendee(attendeeData);
      }
      
      // Update local state - handle waitlisted status too
      if (finalStatus === 'going' || finalStatus === 'not-going' || finalStatus === 'waitlisted') {
        setRsvpStatus(finalStatus); // Keep actual status for proper UI display
      }
      
             // Refresh attendees to get updated counts
       await refreshAttendees();
       
       // Add a small delay to ensure Firestore update has propagated
       await new Promise(resolve => setTimeout(resolve, 500));
       
        console.log('🔍 DEBUG: Quick RSVP completed successfully. New total count should be updated via real-time updates.');
      
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
    
    if (isEventPast) {
      setShowPastEventModal(true);
    } else if (currentUser) {
      // User is logged in - show RSVP modal for event management
      setShowRSVPModal(true);
    } else {
      // User is not logged in - show teaser modal
      setShowTeaserModal(true);
    }
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
  const isGoingButtonDisabled = (currentUser && (rsvpStatus === 'going' || rsvpStatus === 'waitlisted')) || getRSVPButtonState() !== 'active';
  const isNotGoingButtonDisabled = (currentUser && rsvpStatus === 'not-going') || getRSVPButtonState() !== 'active';
  
  // Check if event is sold out (at capacity regardless of waitlist availability) - for watermark only
  const isSoldOutForWatermark = capacityState.isAtCapacity;

  return (
    <>
             <motion.div
         ref={ref}
         layout
         initial={{ opacity: 0, y: 20 }}
         animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
         transition={{ duration: 0.5 }}
                                                                                         className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100 h-[460px] sm:h-[480px] md:h-[500px] lg:h-[520px] xl:h-[540px] flex flex-col mb-4 scroll-mt-20 relative"
       >
                 {/* SOLD OUT Watermark */}
                 {isSoldOutForWatermark && (
                   <div 
                     className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                     aria-hidden="true"
                   >
                     <div 
                       className="text-6xl sm:text-7xl md:text-8xl font-black text-red-500/20 transform -rotate-12 select-none text-center"
                       style={{ 
                         textShadow: '2px 2px 4px rgba(0,0,0,0.1)',
                         letterSpacing: '0.1em',
                         width: '100%'
                       }}
                     >
                       SOLD OUT
                     </div>
                   </div>
                 )}
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
                       className="text-gray-600 text-sm md:text-base leading-5 md:leading-6 line-clamp-2 md:line-clamp-3 overflow-hidden break-words"
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
                  {event.location ? (
                    <div className="line-clamp-1">{event.location}</div>
                  ) : (
                    <div className="line-clamp-1">
                      {getDisplayVenueInfo(event.venueName || '', event.venueAddress || '', false)}
                    </div>
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
              {/* Going Button - Always show, never "SOLD OUT" */}
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
                    : rsvpStatus === 'waitlisted'
                    ? 'bg-purple-100 text-purple-700 cursor-not-allowed'
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
                {rsvpStatus === 'waitlisted' 
                  ? `Waitlisted${waitlistPosition ? ` (#${waitlistPosition})` : ''}`
                  : 'Going'}
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
