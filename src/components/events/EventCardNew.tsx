import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, CheckCircle, Clock, DollarSign, Edit, Hourglass, MoreVertical, Tag, Trash2, Users } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useInView } from 'react-intersection-observer';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { EventDoc } from '../../hooks/useEvents';
import { useUserBlocking } from '../../hooks/useUserBlocking';
import { safeFormat, safeToDate } from '../../utils/dateUtils';
import { distributeStripeFees } from '../../utils/stripePricing';
import { EventTeaserModal } from './EventTeaserModal';
import { PastEventModal } from './PastEventModal';
import { RSVPModalNew as RSVPModal } from './RSVPModalNew';

// ============================================
// RSVP MODE TOGGLE - Easy revert option
// ============================================
// Set to 'modal' to use modal (original behavior)
// Set to 'page' to use new page navigation
const RSVP_MODE: 'modal' | 'page' = 'page';  // ← Change this to 'modal' to revert
// ============================================

import { doc, onSnapshot } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../../config/firebase';
import { useAttendees } from '../../hooks/useAttendees';
import { useWaitlistPositions } from '../../hooks/useWaitlistPositions';
import { AttendeeStatus, CreateAttendeeData } from '../../types/attendee';
import { safeCall } from '../../utils/safeWrapper';
import { useCapacityState } from './RSVPModalNew/hooks/useCapacityState';
// ErrorBoundary removed - not used in this component
import { Lock } from 'lucide-react';
import { isUserApproved } from '../../utils/userUtils';
import { EventImage } from './EventImage';

// PayTherePrice component with fixed positioning tooltip
const PayTherePrice: React.FC = () => {
  const [showTooltip, setShowTooltip] = useState(false);
  const priceRef = useRef<HTMLDivElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (showTooltip && priceRef.current) {
      const rect = priceRef.current.getBoundingClientRect();
      setTooltipPosition({
        top: rect.top - 80, // Position above the element
        left: Math.max(16, rect.left - 128) // Center tooltip, but keep 16px from left edge
      });
    }
  }, [showTooltip]);

  return (
    <div className="flex flex-col gap-0.5">
      <div 
        ref={priceRef}
        className="flex items-center gap-2.5 cursor-help"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <Tag className="w-5 h-5 text-blue-600 flex-shrink-0" />
        <span className="font-semibold text-blue-600">
          Pay There
        </span>
      </div>
      
      {/* Tooltip - Portal to body with fixed positioning */}
      {showTooltip && createPortal(
        <div 
          className="fixed w-64 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl z-[9999] pointer-events-none"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`
          }}
        >
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 transform rotate-45"></div>
          <p className="leading-relaxed">
            RSVP now. Payment will be handled separately at the event or directly with the hosting organization.
          </p>
        </div>,
        document.body
      )}
    </div>
  );
};

interface EventCardProps {
  event: EventDoc;
  onEdit?: () => void;
  onDelete?: () => void;
  onClick?: () => void;
}

const EventCardNew: React.FC<EventCardProps> = ({ event, onEdit, onDelete, onClick }) => {
  const { currentUser } = useAuth();
  const { blockedUsers } = useUserBlocking();
  const navigate = useNavigate();
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
        
        // Only log in development mode when count actually changes
        if (import.meta.env.DEV && newCount !== realTimeAttendingCount) {
          console.log('🔄 EventCardNew: Real-time attendingCount updated:', { 
            eventId: event.id, 
            oldCount: realTimeAttendingCount, 
            newCount
          });
        }
        
        // Always update if the count is different, regardless of current state
        setRealTimeAttendingCount(newCount);
      }
    }, (error) => {
      console.error('EventCardNew: Error listening to event changes:', error);
    });

    return () => unsubscribe();
  }, [event.id]); // Only depend on event.id
  
  // Real-time waitlist positions - ONLY when waitlist is enabled
  const { myPosition: waitlistPosition, waitlistCount: totalWaitlistCount } = useWaitlistPositions(
    event.waitlistEnabled ? event.id : '', 
    event.waitlistEnabled ? currentUser?.id : undefined
  );

  // Create capacity state using live event-level metrics rather than per-user counts
  const liveGoingCount = typeof realTimeAttendingCount === 'number' ? realTimeAttendingCount : counts.totalGoing;
  const liveWaitlistCount = typeof event.waitlistCount === 'number'
    ? event.waitlistCount
    : (typeof totalWaitlistCount === 'number' ? totalWaitlistCount : counts.waitlistedCount);

  const capacityCounts = useMemo(() => ({
    ...counts,
    totalGoing: liveGoingCount,
    goingCount: liveGoingCount,
    waitlistedCount: liveWaitlistCount
  }), [counts, liveGoingCount, liveWaitlistCount]);
  
  const capacityState = useCapacityState(capacityCounts, event.maxAttendees, event.waitlistEnabled, event.waitlistLimit);

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
  const [showPaymentInstructionModal, setShowPaymentInstructionModal] = useState(false);
  const [showNonRefundableModal, setShowNonRefundableModal] = useState(false);
  const [rsvpStatus, setRsvpStatus] = useState<'going' | 'not-going' | 'waitlisted' | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  // Payment tooltip state
  const [showPaymentTooltip, setShowPaymentTooltip] = useState(false);
  const paymentBadgeRef = useRef<HTMLDivElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
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

  // Close options menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showOptionsMenu) {
        setShowOptionsMenu(false);
      }
    };
    
    if (showOptionsMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showOptionsMenu]);

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
  
  // Verify actual "going" count vs stored count
  useEffect(() => {
    if (event.id) {
      // Calculate actual "going" count from all attendees (not just user's attendees)
      // Note: counts.totalGoing only includes user's attendees, so we need to query all
      const calculateActualGoingCount = async () => {
        try {
          const { calculateEffectiveCapacity } = await import('../../services/attendeeService');
          const { totalGoing } = await calculateEffectiveCapacity(event.id);
          const storedCount = realTimeAttendingCount;
          const hasDiscrepancy = totalGoing !== storedCount;
          
          // Count user's own attendees by status for clarity
          const userGoingCount = attendees.filter(a => a.rsvpStatus === 'going').length;
          const userNotGoingCount = attendees.filter(a => a.rsvpStatus === 'not-going').length;
          const userWaitlistedCount = attendees.filter(a => a.rsvpStatus === 'waitlisted').length;
          
          if (import.meta.env.DEV || hasDiscrepancy) {
            console.log('🔍 EventCardNew - Attendee count verification:', {
              eventId: event.id,
              eventTitle: event.title,
              storedCount: storedCount,
              actualGoingCount: totalGoing,
              discrepancy: hasDiscrepancy ? `⚠️ MISMATCH: Stored (${storedCount}) vs Actual (${totalGoing})` : '✅ Match',
              userAttendees: {
                going: userGoingCount,
                notGoing: userNotGoingCount,
                waitlisted: userWaitlistedCount,
                total: attendees.length
              },
              countsTotalGoing: counts.totalGoing,
              maxAttendees: event.maxAttendees,
              isAtCapacity: storedCount >= (event.maxAttendees || 0),
              note: hasDiscrepancy ? 'Cloud Function onAttendeeChange should auto-recalculate. If discrepancy persists, the count may need manual recalculation via manualRecalculateCount Cloud Function.' : undefined,
              clarification: `The displayed count (${storedCount}) represents ONLY attendees with "going" status, NOT "not-going" attendees. Your ${userNotGoingCount} "not-going" attendee(s) are NOT included in this count.`
            });
            
            if (hasDiscrepancy) {
              console.warn(`⚠️ EventCardNew - Count discrepancy detected for event ${event.id}:`, {
                stored: storedCount,
                actual: totalGoing,
                difference: storedCount - totalGoing,
                action: 'The Cloud Function onAttendeeChange should automatically fix this. If it persists, use manualRecalculateCount Cloud Function.'
              });
            }
          }
        } catch (error) {
          console.error('Error verifying attendee count:', error);
        }
      };
      
      // Only verify if we have attendees loaded or if there's a potential issue
      if (attendees.length > 0 || realTimeAttendingCount > 0) {
        calculateActualGoingCount();
      }
    }
  }, [event.id, event.title, realTimeAttendingCount, event.attendingCount, counts.totalGoing, event.maxAttendees, attendees.length, attendees]);
  
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

  // Sync RSVP status from attendees and get payment status
  const [userPaymentStatus, setUserPaymentStatus] = useState<string | null>(null);
  const [primaryUserPaid, setPrimaryUserPaid] = useState<boolean>(false);
  const [unpaidAttendeesCount, setUnpaidAttendeesCount] = useState<number>(0);
  const [totalGoingAttendeesCount, setTotalGoingAttendeesCount] = useState<number>(0);
  
  useEffect(() => {
    if (currentUser && attendees.length > 0) {
      const userAttendee = attendees.find(a => a.userId === currentUser.id && a.attendeeType === 'primary');
      const status = userAttendee ? userAttendee.rsvpStatus : null;
      const primaryPaymentStatus = userAttendee?.paymentStatus || null;
      const isPrimaryPaid = primaryPaymentStatus === 'paid';
      
      // Get all user's attendees who are "going" (primary + family members + guests)
      const userGoingAttendees = attendees.filter(
        a => a.userId === currentUser.id && a.rsvpStatus === 'going'
      );
      
      // Calculate how many are unpaid
      const unpaidCount = userGoingAttendees.filter(
        a => !a.paymentStatus || a.paymentStatus === 'unpaid' || a.paymentStatus === 'pending'
      ).length;
      
      // Determine overall payment status:
      // - If ALL attendees are paid => 'paid'
      // - If primary is unpaid => 'pending' (show old behavior)
      // - If primary is paid but others unpaid => 'payment_required' (show PAYMENT REQUIRED)
      let overallPaymentStatus: string | null = null;
      if (userGoingAttendees.length > 0) {
        const allPaid = userGoingAttendees.every(a => a.paymentStatus === 'paid');
        if (allPaid) {
          overallPaymentStatus = 'paid';
        } else if (!isPrimaryPaid) {
          // Primary user not paid - show old "pending" behavior
          overallPaymentStatus = 'pending';
        } else {
          // Primary paid but others unpaid - show "PAYMENT REQUIRED"
          overallPaymentStatus = 'payment_required';
        }
      }
      
      console.log('[RSVP] Syncing status from attendees', {
        eventId: event.id,
        foundUserAttendee: !!userAttendee,
        status,
        primaryPaymentStatus,
        isPrimaryPaid,
        overallPaymentStatus,
        userGoingAttendeesCount: userGoingAttendees.length,
        unpaidCount,
        previousRsvpStatus: rsvpStatus,
        previousPaymentStatus: userPaymentStatus,
        allAttendees: userGoingAttendees.map(a => ({
          name: a.name,
          type: a.attendeeType,
          paymentStatus: a.paymentStatus
        }))
      });
      
      // Set status for going, not-going, and waitlisted
      if (status === 'going' || status === 'not-going' || status === 'waitlisted') {
        setRsvpStatus(status);
      } else {
        setRsvpStatus(null);
      }
      
      // Set payment status and unpaid count
      setUserPaymentStatus(overallPaymentStatus);
      setPrimaryUserPaid(isPrimaryPaid);
      setUnpaidAttendeesCount(unpaidCount);
      setTotalGoingAttendeesCount(userGoingAttendees.length);
    } else if (currentUser) {
      console.log('[RSVP] No attendees found, resetting status', {
        eventId: event.id,
        attendeesLength: attendees.length
      });
      setRsvpStatus(null);
      setUserPaymentStatus(null);
      setPrimaryUserPaid(false);
      setUnpaidAttendeesCount(0);
      setTotalGoingAttendeesCount(0);
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
    
    try {
      // Handle Firestore Timestamp with toDate method
      if (event.startAt && typeof event.startAt.toDate === 'function') {
        return event.startAt.toDate() < currentTime;
      }
      
      // Handle Firestore Timestamp with seconds property
      if (event.startAt && event.startAt.seconds && typeof event.startAt.seconds === 'number') {
        return new Date(event.startAt.seconds * 1000 + (event.startAt.nanoseconds || 0) / 1000000) < currentTime;
      }
      
      // Handle JavaScript Date
      if (event.startAt instanceof Date) {
        return event.startAt < currentTime;
      }
      
      // Handle timestamp number (milliseconds)
      if (typeof event.startAt === 'number') {
        return new Date(event.startAt) < currentTime;
      }
      
      // Handle timestamp string
      if (typeof event.startAt === 'string') {
        const date = new Date(event.startAt);
        if (isNaN(date.getTime())) {
          console.warn('Invalid date string:', event.startAt);
          return false;
        }
        return date < currentTime;
      }
      
      console.warn('Unknown date format:', event.startAt);
      return false;
    } catch (error) {
      console.error('Error checking if event is past:', event.startAt, error);
      return false;
    }
  }, [event.startAt, currentTime]);

  // Handle view event details click
  // This should ALWAYS navigate to the read-only event details page for ALL users
  // (pending approval users can view details but cannot RSVP)
  const handleViewEventDetails = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    console.log('🔍 View Event Details clicked for event:', {
      id: event.id,
      title: event.title,
      isEventPast: isEventPast,
      currentUser: currentUser?.id
    });
    
    // If custom onClick handler is provided, use it
    if (safeCall(onClick)) {
      // onClick was called safely
      return;
    }
    
    // Navigate directly to RSVP page
    navigate(`/events/${event.id}/rsvp`);
  };

  // Quick RSVP handlers using new attendee system
  const handleQuickRSVP = async (status: AttendeeStatus) => {
    if (isBlockedFromRSVP || isEventPast) {
      return;
    }

    if (!currentUser) {
      setShowTeaserModal(true);
      return;
    }
    if (!isUserApproved(currentUser)) {
      toast.error('Your account is pending approval. You can browse events but cannot RSVP yet.');
      return;
    }

    // For paid events, show payment instruction modal before proceeding with Going
    if (status === 'going' && event.pricing && event.pricing.requiresPayment) {
      setShowPaymentInstructionModal(true);
      return;
    }

    // For paid events with payment confirmed, show non-refundable warning when changing to Not Going
    if (status === 'not-going' && event.pricing && event.pricing.requiresPayment && rsvpStatus === 'going' && userPaymentStatus === 'paid') {
      setShowNonRefundableModal(true);
      return;
    }

    // For all other cases, proceed directly with RSVP
    await processRSVP(status);
  };

  // Handle payment instruction confirmation
  const handlePaymentInstructionConfirm = async () => {
    setShowPaymentInstructionModal(false);
    // Proceed with RSVP as 'going' after user acknowledges payment instructions
    await processRSVP('going');
  };

  // Handle non-refundable confirmation
  const handleNonRefundableConfirm = async () => {
    console.log('[RSVP] Non-refundable confirmed, proceeding with RSVP change to not-going', {
      currentRsvpStatus: rsvpStatus,
      currentPaymentStatus: userPaymentStatus,
      eventId: event.id
    });
    setShowNonRefundableModal(false);
    // Proceed with RSVP as 'not-going' after user confirms
    await processRSVP('not-going');
  };

  // Process RSVP (extracted from handleQuickRSVP)
  const processRSVP = async (status: AttendeeStatus) => {
    let finalStatus = status;
    if (status === 'going' && !capacityState.canAddMore) {
      if (capacityState.canWaitlist) {
        finalStatus = 'waitlisted';
        const position = (capacityState.waitlistCount ?? 0) + 1;
        toast.success(`Event is full. You're #${position} on the waitlist!`);
      } else {
        toast.error('This event is already at capacity and cannot accept new RSVPs. The waitlist is not available for this event.');
        return;
      }
    }

    console.log('[RSVP] Quick RSVP attempt', {
      requestedStatus: status,
      finalStatus,
      eventId: event.id,
      currentUser: currentUser?.id,
      currentRSVPStatus: rsvpStatus,
      currentTotalCount: totalAttendeeCount
    });

    setIsUpdating(true);

    try {
      const existingAttendee = attendees.find(
        (a) => a.userId === currentUser?.id && a.attendeeType === 'primary'
      );

      if (existingAttendee) {
        const attendeeIdToUse = existingAttendee.attendeeId || existingAttendee.id;
        if (!attendeeIdToUse) {
          toast.error('Unable to update RSVP. Please try again.');
          return;
        }
        await setAttendeeStatus(attendeeIdToUse, finalStatus);

        if (finalStatus === 'not-going') {
          // Business Rule: When primary member changes to "not-going", 
          // all family members and guests should also be set to "not-going"
          // (If you're not going, you cannot RSVP on behalf of anyone else)
          const dependents = attendees.filter(
            (a) =>
              a.userId === currentUser?.id &&
              (a.attendeeType === 'family_member' || a.attendeeType === 'guest') &&
              a.rsvpStatus === 'going'
          );

          for (const dependent of dependents) {
            const dependentIdToUse = dependent.attendeeId || dependent.id;
            if (dependentIdToUse) {
              await setAttendeeStatus(dependentIdToUse, 'not-going');
            }
          }

          if (dependents.length > 0) {
            toast.success(`${dependents.length} dependent${dependents.length > 1 ? 's' : ''} (family member${dependents.length > 1 ? 's' : ''}/guest${dependents.length > 1 ? 's' : ''}) automatically marked as "Not Going" since you cannot attend.`);
          }
        }
      } else {
        const attendeeData: CreateAttendeeData = {
          eventId: event.id,
          userId: currentUser!.id,
          attendeeType: 'primary',
          relationship: 'self',
          name: (currentUser!.displayName || currentUser!.firstName || 'Primary User').trim(),
          ageGroup: 'adult',
          rsvpStatus: finalStatus
        };

        await addAttendee(attendeeData);
      }

      // Update local state immediately for better UX
      // The real-time listener will sync with Firestore automatically
      if (finalStatus === 'going' || finalStatus === 'not-going' || finalStatus === 'waitlisted') {
        setRsvpStatus(finalStatus);
      }

      console.log('[RSVP] Quick RSVP completed successfully', {
        finalStatus,
        rsvpStatus,
        userPaymentStatus
      });
    } catch (error) {
      console.error('[RSVP] Error in quick RSVP:', error);
      const message = error instanceof Error ? error.message : String(error);
      const lowerMessage = message.toLowerCase();
      if (
        lowerMessage.includes('permission') ||
        lowerMessage.includes('insufficient') ||
        lowerMessage.includes('full') ||
        lowerMessage.includes('capacity') ||
        lowerMessage.includes('quota')
      ) {
        toast.error('This event is already at capacity and cannot accept additional RSVPs.');
      } else {
        toast.error('Unable to update your RSVP right now. Please try again in a moment.');
      }
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
      // Check if user is approved before allowing RSVP
      if (!isUserApproved(currentUser)) {
        toast.error('Your account is pending approval. You can browse events but cannot RSVP yet.');
        return;
      }
      // User is logged in - flexible RSVP handling based on toggle
      if (RSVP_MODE === 'page') {
        // Navigate to new RSVP page
        navigate(`/events/${event.id}/rsvp`);
      } else {
        // Use original modal (revert option)
        setShowRSVPModal(true);
      }
    } else {
      // User is not logged in - show teaser modal
      setShowTeaserModal(true);
    }
  };


  // Format event date
  const formatEventDate = (date: any) => {
    return safeFormat(date, 'MMM dd, yyyy', 'Date TBD');
  };

  // Format event time
  const formatEventTime = (date: any) => {
    return safeFormat(date, 'h:mm a', '');
  };

  // Calculate event duration in hours
  const getEventDuration = () => {
    if (!event.startAt || !event.endAt) return null;
    
    const startDate = safeToDate(event.startAt);
    const endDate = safeToDate(event.endAt);
    
    if (!startDate || !endDate) return null;
    
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
  // Check if user is approved for RSVP
  const isUserApprovedForRSVP = currentUser ? isUserApproved(currentUser) : false;
  const isGoingButtonDisabled = !isUserApprovedForRSVP || (currentUser && (rsvpStatus === 'going' || rsvpStatus === 'waitlisted')) || getRSVPButtonState() !== 'active';
  const isNotGoingButtonDisabled = !isUserApprovedForRSVP || (currentUser && rsvpStatus === 'not-going') || getRSVPButtonState() !== 'active';
  
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
                                                                                         className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden border border-gray-200 flex flex-col mb-4 scroll-mt-20 relative w-full max-w-lg mx-auto h-auto"
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
                 {/* Event Image with Smart Error Handling - Fixed height on mobile, responsive on larger screens */}
         <div className="w-full h-48 sm:h-56 md:h-64 flex-shrink-0 relative bg-gray-100">
           <div className="w-full h-full overflow-hidden rounded-t-xl">
             <EventImage 
               src={event.imageUrl} 
               alt={event.title} 
               fit="contain" 
               aspect="16/9"
               className="w-full h-full object-contain"
               title={event.title}
             />
           </div>
           
           {/* Top Right Buttons - Outside overflow container */}
           <div className="absolute top-3 right-3 flex gap-2 z-20">
             {/* Three-dot Menu Button (Admin Only) */}
             {currentUser?.role === 'admin' && (onEdit || onDelete) && (
               <div className="relative">
                 <motion.button
                   whileHover={{ scale: 1.05 }}
                   whileTap={{ scale: 0.95 }}
                   onClick={(e) => {
                     e.stopPropagation();
                     setShowOptionsMenu(!showOptionsMenu);
                   }}
                   className="p-2 bg-white/90 backdrop-blur-sm text-gray-700 hover:text-[#F25129] hover:bg-white rounded-lg transition-all duration-200 shadow-lg"
                   title="More options"
                 >
                   <MoreVertical className="w-4 h-4" />
                 </motion.button>
                 
                 {/* Dropdown Menu */}
                 <AnimatePresence>
                   {showOptionsMenu && (
                     <motion.div
                       initial={{ opacity: 0, scale: 0.95, y: -10 }}
                       animate={{ opacity: 1, scale: 1, y: 0 }}
                       exit={{ opacity: 0, scale: 0.95, y: -10 }}
                       transition={{ duration: 0.15 }}
                       className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-[100]"
                       onClick={(e) => e.stopPropagation()}
                     >
                       {onEdit && (
                         <button
                           onClick={(e) => {
                             e.stopPropagation();
                             setShowOptionsMenu(false);
                             safeCall(onEdit);
                           }}
                           className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-green-50 text-gray-700 hover:text-green-600 transition-colors"
                         >
                           <Edit className="w-4 h-4" />
                           <span className="font-medium">Edit Event</span>
                         </button>
                       )}
                       {onDelete && (
                         <button
                           onClick={(e) => {
                             e.stopPropagation();
                             setShowOptionsMenu(false);
                             safeCall(onDelete);
                           }}
                           className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-red-50 text-gray-700 hover:text-red-600 transition-colors border-t border-gray-100"
                         >
                           <Trash2 className="w-4 h-4" />
                           <span className="font-medium">Delete Event</span>
                         </button>
                       )}
                     </motion.div>
                   )}
                 </AnimatePresence>
               </div>
             )}
           </div>
         </div>

        {/* Event Content - Flex to fill remaining space */}
        <div className="p-6 flex flex-col flex-1">
                     {/* Event Title - Single line across all devices */}
           <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 line-clamp-1 truncate flex-shrink-0">
             {event.title}
           </h3>

                                                                                                                                                                                                                                                                                                                                                               {/* Event Description - Fixed to 2 lines with View Details moved up */}
             <div className="mb-4 relative flex flex-col">
               {(() => {
                 const hasDesc = !!event.description?.trim();
                 return hasDesc ? (
                   <>
                     <p
                       ref={descRef}
                       className="text-gray-600 text-sm md:text-base leading-5 md:leading-6 line-clamp-2 overflow-hidden break-words"
                     >
                       {event.description}
                     </p>

                     {/* View Details link - Restored to original location in description area (moved back from bottom right) */}
                     <div className="mt-0.5 flex items-center">
                       {isClamped && (
                         <button
                           type="button"
                           onClick={handleViewEventDetails}
                           role="link"
                           aria-label={`View details for ${event.title}`}
                           className="text-[#F25129] hover:text-[#E0451F] font-medium hover:underline bg-white px-1 rounded focus:outline-none focus:ring-2 focus:ring-[#F25129]/40 whitespace-nowrap text-sm"
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

                                           {/* Event Details - Consistent spacing for all devices */}
            <div className="space-y-3 mb-4">
            {/* Line 1: Date and Time - Enhanced Typography */}
            <div className="flex items-center gap-4 text-gray-700 text-sm sm:text-base flex-wrap">
              <div className="flex items-center gap-2.5">
                <Calendar className="w-5 h-5 text-[#F25129] flex-shrink-0" />
                <span className="font-normal">{formatEventDate(event.startAt)}</span>
              </div>
              {event.startAt && (
                <div className="flex items-center gap-2.5">
                  <Clock className="w-5 h-5 text-[#F25129] flex-shrink-0" />
                  <span className="font-normal">
                    {formatEventTime(event.startAt)}
                    {event.endAt && ` - ${formatEventTime(event.endAt)}`}
                  </span>
                </div>
              )}
            </div>

            {/* Line 2: Attendees and Price - Enhanced Visual Weight */}
            <div className="flex items-center gap-4 text-gray-700 text-sm sm:text-base flex-wrap">
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-[#F25129] flex-shrink-0" />
                <span className="font-normal">
                  {totalAttendeeCount} attending
                  {event.maxAttendees && ` / ${event.maxAttendees} max`}
                </span>
              </div>
              
              {/* Price Display */}
              {event.pricing?.payThere ? (
                <PayTherePrice />
              ) : event.pricing && event.pricing.requiresPayment && event.pricing.adultPrice ? (
                (() => {
                  // Calculate proportional Stripe fees for ticket + support
                  const components = [];
                  components.push({
                    id: 'ticket',
                    label: 'Ticket',
                    netAmount: event.pricing.adultPrice
                  });
                  if (event.pricing.eventSupportAmount && event.pricing.eventSupportAmount > 0) {
                    components.push({
                      id: 'support',
                      label: 'Event Support',
                      netAmount: event.pricing.eventSupportAmount
                    });
                  }
                  const charged = distributeStripeFees(components);
                  const ticketCharge = charged.find(c => c.id === 'ticket')?.chargeAmount || 0;
                  const supportCharge = charged.find(c => c.id === 'support')?.chargeAmount || 0;
                  
                  return (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2.5">
                        <Tag className="w-5 h-5 text-blue-600 flex-shrink-0" />
                        <span className="font-semibold text-blue-600">
                          ${(ticketCharge / 100).toFixed(2)}
                        </span>
                      </div>
                      {supportCharge > 0 && (
                        <div className="text-xs text-gray-600 ml-7">
                          Event Support: ${(supportCharge / 100).toFixed(2)}
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : event.pricing?.eventSupportAmount && event.pricing.eventSupportAmount > 0 ? (
                (() => {
                  // Free event but with event support
                  const charged = distributeStripeFees([{
                    id: 'support',
                    label: 'Event Support',
                    netAmount: event.pricing.eventSupportAmount
                  }]);
                  const supportCharge = charged[0]?.chargeAmount || 0;
                  
                  return (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2.5">
                        <Tag className="w-5 h-5 text-purple-600 flex-shrink-0" />
                        <span className="font-semibold text-purple-600">
                          Free
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 ml-7">
                        Event Support: ${(supportCharge / 100).toFixed(2)}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="flex items-center gap-2.5">
                  <Tag className="w-5 h-5 text-gray-500 flex-shrink-0" />
                  <span className="font-semibold text-gray-500">
                    Free
                  </span>
                </div>
              )}
            </div>

            {/* RSVP Status Section - Enhanced Professional Badges */}
            <div className="space-y-2 mt-5">
              {/* RSVP Status - Non-Paid Going */}
              {currentUser && rsvpStatus === 'going' && (!event.pricing || !event.pricing.requiresPayment) && (
                <div className="inline-flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                  <span className="font-medium text-green-700 text-sm">You're Going</span>
                </div>
              )}

              {/* RSVP Status - Non-Paid Not Going */}
              {currentUser && rsvpStatus === 'not-going' && (!event.pricing || !event.pricing.requiresPayment) && (
                <div className="inline-flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                  <span className="font-medium text-red-700 text-sm">Not Going</span>
                </div>
              )}

              {/* RSVP Status - Paid Events with ALL Attendees Payment Confirmed */}
              {currentUser && rsvpStatus === 'going' && event.pricing && event.pricing.requiresPayment && userPaymentStatus === 'paid' && (
                <div className="inline-flex items-center gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                    <span className="font-medium text-green-700 text-sm">You're Going</span>
                  </div>
                  <div className="h-4 w-px bg-green-200"></div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" strokeWidth={2} />
                    <span className="font-semibold text-green-600 text-xs">PAID</span>
                  </div>
                </div>
              )}

              {/* RSVP Status - Primary User Not Paid (Old Behavior - Show You're Going + PENDING) */}
              {currentUser && rsvpStatus === 'going' && event.pricing && event.pricing.requiresPayment && userPaymentStatus === 'pending' && (
                <div className="inline-flex items-center gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                    <span className="font-medium text-amber-700 text-sm">You're Going</span>
                  </div>
                  <div className="h-4 w-px bg-amber-200"></div>
                  <div className="flex items-center gap-1.5">
                    <Hourglass className="w-4 h-4 text-amber-600 flex-shrink-0" strokeWidth={2} />
                    <span className="font-semibold text-amber-600 text-xs">PENDING</span>
                  </div>
                </div>
              )}

              {/* RSVP Status - Primary Paid but Family/Guests Unpaid (Show PAYMENT REQUIRED) */}
              {currentUser && rsvpStatus === 'going' && event.pricing && event.pricing.requiresPayment && userPaymentStatus === 'payment_required' && (
                <div 
                  ref={paymentBadgeRef}
                  className="inline-flex items-center gap-1.5 cursor-help"
                  onMouseEnter={() => {
                    setShowPaymentTooltip(true);
                    if (paymentBadgeRef.current) {
                      const rect = paymentBadgeRef.current.getBoundingClientRect();
                      setTooltipPosition({
                        top: rect.top - 10,
                        left: rect.left + rect.width / 2
                      });
                    }
                  }}
                  onMouseLeave={() => setShowPaymentTooltip(false)}
                >
                  <DollarSign className="w-4 h-4 text-amber-600 flex-shrink-0" strokeWidth={2} />
                  <span className="font-semibold text-amber-600 text-xs">PAYMENT REQUIRED</span>
                </div>
              )}

              {/* RSVP Status - Paid Events with Not Going */}
              {currentUser && rsvpStatus === 'not-going' && event.pricing && event.pricing.requiresPayment && (
                <div className="inline-flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                  <span className="font-medium text-red-700 text-sm">Not Going</span>
                </div>
              )}
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
                title={!isUserApprovedForRSVP && currentUser ? 'Account pending approval - cannot RSVP yet' : undefined}
                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg font-semibold transition-all duration-200 text-xs relative z-50 pointer-events-auto shadow-sm ${
                  rsvpStatus === 'going'
                    ? 'bg-green-100 text-green-700 border border-green-300 cursor-not-allowed'
                    : rsvpStatus === 'waitlisted'
                    ? 'bg-purple-100 text-purple-700 border border-purple-300 cursor-not-allowed'
                    : isGoingButtonDisabled
                    ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700 hover:shadow-md border border-green-700'
                }`}
              >
                {isUpdating ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                ) : !isUserApprovedForRSVP && currentUser ? (
                  <Lock className="w-3 h-3" />
                ) : null}
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
                title={!isUserApprovedForRSVP && currentUser ? 'Account pending approval - cannot RSVP yet' : undefined}
                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg font-semibold transition-all duration-200 text-xs relative z-50 pointer-events-auto shadow-sm ${
                  rsvpStatus === 'not-going'
                    ? 'bg-red-100 text-red-700 border border-red-300 cursor-not-allowed'
                    : isNotGoingButtonDisabled
                    ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                    : 'bg-red-600 text-white hover:bg-red-700 hover:shadow-md border border-red-700'
                }`}
              >
                {isUpdating ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                ) : !isUserApprovedForRSVP && currentUser ? (
                  <Lock className="w-3 h-3" />
                ) : null}
                Can't Go
              </motion.button>
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

      {/* Payment Instruction Modal - Outside AnimatePresence for portal compatibility */}
      {showPaymentInstructionModal && createPortal(
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
            onClick={() => setShowPaymentInstructionModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative"
            >
              {/* Close button */}
              <button
                onClick={() => setShowPaymentInstructionModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Icon */}
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                  <DollarSign className="w-8 h-8 text-blue-600" />
                </div>
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-gray-900 text-center mb-4">
                Payment Instructions
              </h3>

              {/* Message */}
              <p className="text-gray-700 text-center mb-6 leading-relaxed">
                Pay via Zelle to <span className="font-semibold text-blue-600">momsfitnessmojo@gmail.com</span>.<br />
                Please notify the host after completing the payment.<br />
                Your spot is not confirmed until payment is received.<br />
                For questions, contact the host.
              </p>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPaymentInstructionModal(false)}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePaymentInstructionConfirm}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-[#F25129] to-[#E0451F] hover:from-[#E0451F] hover:to-[#D03D1B] text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl"
                >
                  Ok
                </button>
              </div>
            </motion.div>
          </motion.div>,
          document.body
        )}

      {/* Non-Refundable Confirmation Modal - Outside AnimatePresence for portal compatibility */}
      {showNonRefundableModal && createPortal(
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
            onClick={() => setShowNonRefundableModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative"
            >
              {/* Close button */}
              <button
                onClick={() => setShowNonRefundableModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Icon */}
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-gray-900 text-center mb-4">
                Non-Refundable Event
              </h3>

              {/* Message */}
              <p className="text-gray-700 text-center mb-6 leading-relaxed">
                This event is non-refundable.<br />
                Are you sure you want to change your RSVP to Not Going?
              </p>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowNonRefundableModal(false)}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleNonRefundableConfirm}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl"
                >
                  Yes
                </button>
              </div>
            </motion.div>
          </motion.div>,
          document.body
        )}

      {/* Payment Required Tooltip - Portal for screen-friendly positioning */}
      {showPaymentTooltip && createPortal(
        <div 
          className="fixed w-72 sm:w-80 bg-gray-900 text-white text-sm rounded-lg p-4 shadow-2xl z-[9999] pointer-events-none"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            transform: 'translate(-50%, -100%)',
            maxWidth: 'calc(100vw - 2rem)'
          }}
        >
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-900 transform rotate-45"></div>
          <p className="leading-relaxed">
            <span className="font-semibold text-amber-300">{unpaidAttendeesCount} of {totalGoingAttendeesCount}</span> attendee{totalGoingAttendeesCount > 1 ? 's' : ''} still need{totalGoingAttendeesCount === 1 ? 's' : ''} payment.
            {totalGoingAttendeesCount > 1 && ' Complete payment for all attendees to finalize your RSVP.'}
          </p>
        </div>,
        document.body
      )}
    </>
  );
};

export default EventCardNew;
