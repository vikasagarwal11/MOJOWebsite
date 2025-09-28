import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Calendar, MapPin, Users, Share2, Heart, MessageCircle, Eye, CheckCircle, XCircle, ThumbsUp, ThumbsDown, Clock, Link, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { EventDoc } from '../../hooks/useEvents';
import { RSVPModalNew as RSVPModal } from './RSVPModalNew';
import { EventTeaserModal } from './EventTeaserModal';
import { PastEventModal } from './PastEventModal';
import { useAuth } from '../../contexts/AuthContext';
import { useUserBlocking } from '../../hooks/useUserBlocking';
import { useUserRSVPs } from '../../hooks/useUserRSVPs';
import { useCapacityState } from './RSVPModalNew/hooks/useCapacityState';
import { doc, setDoc, updateDoc, getDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../config/firebase';
import toast from 'react-hot-toast';

interface EventCardProps {
  event: EventDoc;
  onEdit?: () => void;
  onClick?: () => void;
}

// Utility function to recalculate total attendee count from all RSVPs
const recalculateEventAttendeeCount = async (eventId: string): Promise<number> => {
  try {
    console.log('🔍 DEBUG: Starting attendee count recalculation for event:', eventId);
    
    const rsvpsRef = collection(db, 'events', eventId, 'rsvps');
    const rsvpsSnapshot = await getDocs(rsvpsRef);
    
    console.log('🔍 DEBUG: Found', rsvpsSnapshot.size, 'RSVP documents');
    
    let totalAttendees = 0;
    let rsvpDetails: any[] = [];
    
    rsvpsSnapshot.forEach((doc) => {
      const rsvpData = doc.data();
      console.log('🔍 DEBUG: Processing RSVP document:', {
        docId: doc.id,
        userId: rsvpData.userId,
        status: rsvpData.status,
        adults: rsvpData.adults,
        childCounts: rsvpData.childCounts,
        guests: rsvpData.guests,
        rawData: rsvpData
      });
      
      if (rsvpData.status === 'going') {
        let rsvpContribution = 0;
        
        // Count additional adults (handle corrupted data)
        const adults = typeof rsvpData.adults === 'number' ? rsvpData.adults : 0;
        const cleanAdults = Math.max(0, adults);
        rsvpContribution += cleanAdults;
        if (cleanAdults > 0) {
          console.log('🔍 DEBUG: +', cleanAdults, 'for additional adults, running total:', totalAttendees + rsvpContribution);
        }
        
        // Count children (handle corrupted data)
        if (rsvpData.childCounts && Array.isArray(rsvpData.childCounts)) {
          rsvpData.childCounts.forEach((child: any, index: number) => {
            if (child && typeof child.count === 'number' && !isNaN(child.count)) {
              const cleanChildCount = Math.max(0, child.count);
              rsvpContribution += cleanChildCount;
              if (cleanChildCount > 0) {
                console.log('🔍 DEBUG: +', cleanChildCount, 'for child', index, '(', child.ageGroup, '), running total:', totalAttendees + rsvpContribution);
              }
            }
          });
        }
        
        // Count guests (handle corrupted data)
        if (rsvpData.guests && Array.isArray(rsvpData.guests)) {
          const guestCount = rsvpData.guests.length;
          rsvpContribution += guestCount;
          if (guestCount > 0) {
            console.log('🔍 DEBUG: +', guestCount, 'for guests, running total:', totalAttendees + rsvpContribution);
          }
        }
        
        totalAttendees += rsvpContribution;
        
        rsvpDetails.push({
          userId: rsvpData.userId,
          status: rsvpData.status,
          contribution: rsvpContribution,
          breakdown: {
            primary: 0, // FIXED: Changed from 1 to 0 since we're not adding +1 separately
            adults: cleanAdults,
            children: rsvpData.childCounts ? Object.values(rsvpData.childCounts).reduce((sum: number, count: any) => sum + Math.max(0, count || 0), 0) : 0,
            guests: rsvpData.guests ? rsvpData.guests.length : 0
          }
        });
        
        console.log('🔍 DEBUG: RSVP contribution:', rsvpContribution, 'Total so far:', totalAttendees);
      } else {
        console.log('🔍 DEBUG: Skipping RSVP with status:', rsvpData.status);
      }
    });
    
    // FIXED: Ensure total is never negative
    const finalTotal = Math.max(0, totalAttendees);
    
    console.log('🔍 DEBUG: Final calculation breakdown:', {
      eventId: eventId,
      totalRSVPs: rsvpDetails.length,
      rsvpDetails: rsvpDetails,
      rawTotal: totalAttendees,
      finalTotal: finalTotal
    });
    
    console.log('🔍 Recalculated attendee count for event:', eventId, 'Total:', finalTotal);
    return finalTotal;
  } catch (error) {
    console.error('❌ Error recalculating attendee count:', error);
    return 0;
  }
};

// Utility function to clean up corrupted RSVP data
const cleanupCorruptedRSVPData = async (eventId: string): Promise<void> => {
  try {
    console.log('🧹 Starting cleanup of corrupted RSVP data for event:', eventId);
    
    const rsvpsRef = collection(db, 'events', eventId, 'rsvps');
    const rsvpsSnapshot = await getDocs(rsvpsRef);
    
    const batch = writeBatch(db);
    let cleanupCount = 0;
    
    rsvpsSnapshot.forEach((doc) => {
      const rsvpData = doc.data();
      let needsUpdate = false;
      const cleanedData: any = { ...rsvpData };
      
      // Clean up corrupted adults field
      if (typeof rsvpData.adults !== 'number' || isNaN(rsvpData.adults)) {
        cleanedData.adults = 0;
        needsUpdate = true;
      }
      
      // Clean up corrupted childCounts
      if (rsvpData.childCounts && Array.isArray(rsvpData.childCounts)) {
        const cleanedChildCounts = rsvpData.childCounts.map((child: any) => {
          if (child && typeof child.count === 'number' && !isNaN(child.count)) {
            return child;
          } else {
            return { ageGroup: child?.ageGroup || '11+', count: 0 };
          }
        });
        cleanedData.childCounts = cleanedChildCounts;
        needsUpdate = true;
      }
      
      // Clean up corrupted guests
      if (rsvpData.guests && !Array.isArray(rsvpData.guests)) {
        cleanedData.guests = [];
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        batch.update(doc.ref, cleanedData);
        cleanupCount++;
      }
    });
    
    if (cleanupCount > 0) {
      await batch.commit();
      console.log('✅ Cleaned up', cleanupCount, 'corrupted RSVP documents');
      
      // Recalculate the event count after cleanup
      const recalculatedCount = await recalculateEventAttendeeCount(eventId);
      const eventRef = doc(db, 'events', eventId);
      await updateDoc(eventRef, {
        attendingCount: recalculatedCount,
        updatedAt: new Date()
      });
      console.log('✅ Event count updated to:', recalculatedCount);
    } else {
      console.log('✅ No corrupted RSVP data found');
    }
  } catch (error) {
    console.error('❌ Error cleaning up corrupted RSVP data:', error);
  }
};

const EventCard: React.FC<EventCardProps> = ({ event, onEdit, onClick }) => {
  const { currentUser } = useAuth();
  const { blockedUsers } = useUserBlocking();
  const { userRSVPs } = useUserRSVPs([event.id]);
  const [showRSVPModal, setShowRSVPModal] = useState(false);
  const [showTeaserModal, setShowTeaserModal] = useState(false);
  const [showPastEventModal, setShowPastEventModal] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [rsvpStatus, setRsvpStatus] = useState<'going' | 'not-going' | 'pending' | null>(null);
  
  // State to track if attendee count needs attention
  const [attendeeCountNeedsAttention, setAttendeeCountNeedsAttention] = useState(false);

  // Create capacity state for this event
  const mockCounts = useMemo(() => ({
    goingCount: event.attendingCount || 0,
    notGoingCount: 0,
    pendingCount: 0,
    waitlistedCount: 0,
    totalGoing: event.attendingCount || 0
  }), [event.attendingCount]);
  
  const capacityState = useCapacityState(mockCounts, event.maxAttendees);
  
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

  // Sync RSVP status from database
  useEffect(() => {
    if (currentUser && userRSVPs.length > 0) {
      const rsvp = userRSVPs.find(r => r.eventId === event.id);
      const status = rsvp ? rsvp.status : null;
      setRsvpStatus(status);
    } else if (currentUser) {
      setRsvpStatus(null);
    }
  }, [currentUser, event.id, userRSVPs]);

  // Check if attendee count needs attention (for debugging)
  useEffect(() => {
    const checkAttendeeCount = async () => {
      if (currentUser?.role === 'admin') {
        try {
          console.log('🔍 DEBUG: Checking attendee count mismatch for event:', event.id);
          console.log('🔍 DEBUG: Current displayed count:', event.attendingCount);
          
          const actualCount = await recalculateEventAttendeeCount(event.id);
          const displayedCount = event.attendingCount || 0;
          
          console.log('🔍 DEBUG: Comparison values:', {
            displayedCount: displayedCount,
            actualCount: actualCount,
            difference: displayedCount - actualCount
          });
          
          // FIXED: Ensure both counts are non-negative for comparison
          const cleanActualCount = Math.max(0, actualCount);
          const cleanDisplayedCount = Math.max(0, displayedCount);
          
          if (cleanActualCount !== cleanDisplayedCount) {
            console.log('⚠️ Attendee count mismatch detected:', {
              eventId: event.id,
              displayedCount: cleanDisplayedCount,
              actualCount: cleanActualCount,
              difference: cleanDisplayedCount - cleanActualCount,
              originalDisplayed: displayedCount,
              originalActual: actualCount
            });
            setAttendeeCountNeedsAttention(true);
          } else {
            console.log('🔍 DEBUG: Attendee counts match, no attention needed');
            setAttendeeCountNeedsAttention(false);
          }
        } catch (error) {
          console.error('Error checking attendee count:', error);
        }
      }
    };
    
    checkAttendeeCount();
  }, [currentUser?.role, event.id, event.attendingCount]);

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
  const handleQuickRSVP = async (status: 'going' | 'not-going') => {
    if (isBlockedFromRSVP || !currentUser) return;
    
    // Check capacity for 'going' status
    if (status === 'going' && !capacityState.canAddMore) {
      toast.error('Event is at full capacity. No more RSVPs can be accepted.');
      return;
    }
    
    console.log('🔍 DEBUG: Quick RSVP started:', {
      status,
      eventId: event.id,
      currentUser: currentUser.id,
      currentRSVPStatus: rsvpStatus,
      currentEventCount: event.attendingCount
    });
    
    try {
      // Get current RSVP to calculate correct attendee difference
      const currentRSVPRef = doc(db, 'events', event.id, 'rsvps', currentUser.id);
      
      // Calculate attendee count for previous status
      let previousAttendeeCount = 0;
      if (rsvpStatus === 'going') {
        // Try to get actual attendee count from existing RSVP
        try {
          const existingRSVP = await getDoc(currentRSVPRef);
          if (existingRSVP.exists()) {
            const data = existingRSVP.data();
            previousAttendeeCount = (data.adults || 0) + 
              (data.childCounts ? Object.values(data.childCounts).reduce((sum: number, count: any) => sum + (count || 0), 0) : 0) +
              (data.guests ? data.guests.length : 0);
            console.log('🔍 DEBUG: Found existing RSVP with attendee count:', previousAttendeeCount, 'data:', data);
          }
        } catch (error) {
          console.log('⚠️ Could not fetch existing RSVP, assuming 1 attendee');
          previousAttendeeCount = 1;
        }
      }
      
      console.log('🔍 DEBUG: Previous attendee count:', previousAttendeeCount);
      
      // For Quick RSVP, we need to check if there's an existing RSVP with more attendees
      let newAttendeeCount = 0;
      let rsvpData;
      
      if (status === 'going') {
        // Check if there's an existing RSVP with children/guests
        try {
          const existingRSVP = await getDoc(currentRSVPRef);
          if (existingRSVP.exists()) {
            const data = existingRSVP.data();
            console.log('🔍 DEBUG: Existing RSVP data found:', data);
            
            // If existing RSVP has children or guests, preserve them
            if (data.childCounts || data.guests) {
              rsvpData = {
                eventId: event.id,
                userId: currentUser.id,
                displayName: currentUser.displayName,
                email: currentUser.email,
                status: status,
                adults: data.adults || 0, // FIXED: Changed from 1 to 0 for simple RSVPs
                childCounts: data.childCounts || null,
                guests: data.guests || null,
                notes: data.notes || null,
                createdAt: data.createdAt || new Date(),
                updatedAt: new Date(),
                statusHistory: [
                  ...(data.statusHistory || []),
                  {
                    status: status,
                    changedAt: new Date(),
                    changedBy: currentUser.id
                  }
                ]
              };
              // Calculate total attendees including existing children/guests
              newAttendeeCount = (rsvpData.adults || 0) + 
                (rsvpData.childCounts ? Object.values(rsvpData.childCounts).reduce((sum: number, count: any) => sum + (count || 0), 0) : 0) +
                (rsvpData.guests ? rsvpData.guests.length : 0);
              console.log('🔍 DEBUG: Preserving existing children/guests, new attendee count:', newAttendeeCount);
            } else {
              // No existing children/guests, just primary user
              rsvpData = {
                eventId: event.id,
                userId: currentUser.id,
                displayName: currentUser.displayName,
                email: currentUser.email,
                status: status,
                adults: 0, // FIXED: Changed from 1 to 0 for simple RSVPs
                childCounts: null,
                guests: null,
                notes: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                statusHistory: [{
                  status: status,
                  changedAt: new Date(),
                  changedBy: currentUser.id
                }]
              };
              newAttendeeCount = 0; // FIXED: Primary user is not an additional attendee
              console.log('🔍 DEBUG: No existing children/guests, new attendee count:', newAttendeeCount);
            }
          } else {
            // No existing RSVP, create new with just primary user
            rsvpData = {
              eventId: event.id,
              userId: currentUser.id,
              displayName: currentUser.displayName,
              email: currentUser.email,
              status: status,
              adults: 0, // FIXED: Changed from 1 to 0 for simple RSVPs
              childCounts: null,
              guests: null,
              notes: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              statusHistory: [{
                status: status,
                changedAt: new Date(),
                changedBy: currentUser.id
              }]
            };
            newAttendeeCount = 0; // FIXED: Primary user is not an additional attendee
            console.log('🔍 DEBUG: No existing RSVP, creating new with attendee count:', newAttendeeCount);
          }
        } catch (error) {
          console.log('⚠️ Could not fetch existing RSVP, creating new with 1 attendee');
          rsvpData = {
            eventId: event.id,
            userId: currentUser.id,
            displayName: currentUser.displayName,
            email: currentUser.email,
            status: status,
            adults: 0, // FIXED: Changed from 1 to 0 for simple RSVPs
            childCounts: null,
            guests: null,
            notes: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            statusHistory: [{
              status: status,
              changedAt: new Date(),
              changedBy: currentUser.id
            }]
          };
          newAttendeeCount = 0; // FIXED: Primary user is not an additional attendee
        }
      } else {
        // Not going - no attendees
        rsvpData = {
          eventId: event.id,
          userId: currentUser.id,
          displayName: currentUser.displayName,
          email: currentUser.email,
          status: status,
          adults: 0,
          childCounts: null,
          guests: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          statusHistory: [{
            status: status,
            changedAt: new Date(),
            changedBy: currentUser.id
          }]
        };
        newAttendeeCount = 0;
        console.log('🔍 DEBUG: Not going, new attendee count:', newAttendeeCount);
      }
      
      console.log('🔍 DEBUG: RSVP data prepared:', {
        status: rsvpData.status,
        adults: rsvpData.adults,
        childCounts: rsvpData.childCounts,
        guests: rsvpData.guests,
        newAttendeeCount: newAttendeeCount
      });
      
      // Update local state immediately for responsive UI
      setRsvpStatus(status);
      
      // Submit RSVP to database
      const rsvpRef = doc(db, 'events', event.id, 'rsvps', currentUser.id);
      console.log('🔍 DEBUG: Submitting RSVP to database...');
      await setDoc(rsvpRef, rsvpData);
      console.log('🔍 DEBUG: RSVP submitted successfully to database');

      // Recalculate total attendee count from all RSVPs instead of incrementing/decrementing
      console.log('🔍 DEBUG: Starting attendee count recalculation...');
      const recalculatedCount = await recalculateEventAttendeeCount(event.id);
      
      // FIXED: Prevent negative counts
      const finalCount = Math.max(0, recalculatedCount);
      
      console.log('🔍 DEBUG: Count recalculation complete:', {
        recalculatedCount: recalculatedCount,
        finalCount: finalCount,
        expectedCount: newAttendeeCount
      });
      
      // Update event with recalculated count
      const eventRef = doc(db, 'events', event.id);
      console.log('🔍 DEBUG: Updating event with new count:', finalCount);
      await updateDoc(eventRef, {
        attendingCount: finalCount,
        updatedAt: new Date()
      });
      console.log('🔍 DEBUG: Event updated successfully');

      console.log('✅ Quick RSVP submitted successfully:', {
        status,
        previousAttendees: previousAttendeeCount,
        newAttendees: newAttendeeCount,
        recalculatedTotalCount: finalCount,
        rsvpData: rsvpData
      });
      
      // Show success toast
      toast.success(status === 'going' ? 'RSVP confirmed! You\'re going to this event.' : 'RSVP updated. You\'re not going to this event.');
    } catch (error) {
      console.error('❌ Quick RSVP failed:', error);
      // Revert local state on error
      setRsvpStatus(rsvpStatus);
      // Show error toast
      toast.error('Failed to update RSVP. Please try again.');
    }
  };

  // Share event
  const shareEvent = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: event.title,
          text: event.description || `Join MOJO for ${event.title}`,
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

  // Debug function to manually fix attendee count (useful for fixing corrupted data)
  const debugFixAttendeeCount = async () => {
    if (currentUser?.role !== 'admin') return;
    
    try {
      console.log('🔧 Debug: Starting comprehensive fix for event:', event.id);
      
      // Step 1: Clean up corrupted RSVP data
      await cleanupCorruptedRSVPData(event.id);
      
      // Step 2: Recalculate attendee count from clean data
      const recalculatedCount = await recalculateEventAttendeeCount(event.id);
      const eventRef = doc(db, 'events', event.id);
      
      await updateDoc(eventRef, {
        attendingCount: recalculatedCount,
        updatedAt: new Date()
      });
      
      console.log('✅ Debug: Event completely fixed. New count:', recalculatedCount);
      
      // Force a refresh of the component
      window.location.reload();
    } catch (error) {
      console.error('❌ Debug: Failed to fix event:', error);
    }
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
        className={`group event-card relative bg-white rounded-xl shadow-lg transition-transform overflow-hidden h-[480px] flex flex-col ${
          isEventPast ? 'opacity-75 grayscale cursor-default hover:shadow-lg' : 'cursor-pointer hover:shadow-2xl hover:-translate-y-2 hover:rotate-[0.25deg]'
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
            <p className="text-gray-600 text-sm leading-relaxed mb-3 line-clamp-3 break-words">
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

                         {/* Quick RSVP Status Icons with Single Attendee Count and Share */}
             {currentUser && !isBlockedFromRSVP && !isEventPast && (
               <div className="mb-3 flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   {/* Going Button */}
                   <motion.button
                     whileHover={{ scale: 1.05 }}
                     whileTap={{ scale: 0.95 }}
                     onClick={(e) => {
                       e.stopPropagation();
                       handleQuickRSVP('going');
                     }}
                     disabled={rsvpStatus === 'going'} // FIXED: Disable when already going
                     className={`p-2 rounded-full transition-all duration-200 ${
                       rsvpStatus === 'going'
                         ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg cursor-not-allowed opacity-75'
                         : 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-600 hover:from-green-100 hover:to-emerald-100 border border-green-200 hover:border-green-300'
                     }`}
                     title={rsvpStatus === 'going' ? 'Already Going' : 'Going'}
                   >
                     <ThumbsUp className="w-4 h-4" />
                   </motion.button>
                   
                   {/* Single Attendee Count - Total people RSVP'd as Going */}
                   <span className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full border text-purple-600 bg-purple-100 border-purple-200">
                     <Users className="w-3 h-3" />
                     {Math.max(0, event.attendingCount || 0)} {/* FIXED: Prevent negative display */}
                     <span className="text-xs opacity-75 ml-1">Going</span>
                     {/* Warning indicator for admins when count needs attention */}
                     {attendeeCountNeedsAttention && currentUser?.role === 'admin' && (
                       <div className="relative group">
                         <AlertTriangle className="w-3 h-3 text-orange-500 cursor-help" />
                         <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                           Attendee count may be incorrect - click 'Fix Count' to recalculate
                         </div>
                       </div>
                     )}
                   </span>
                   
                   {/* Not Going Button */}
                   <motion.button
                     whileHover={{ scale: 1.05 }}
                     whileTap={{ scale: 0.95 }}
                     onClick={(e) => {
                       e.stopPropagation();
                       handleQuickRSVP('not-going');
                     }}
                     disabled={rsvpStatus === 'not-going'} // FIXED: Disable when already not going
                     className={`p-2 rounded-full transition-all duration-200 ${
                       rsvpStatus === 'not-going'
                         ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg cursor-not-allowed opacity-75'
                         : 'bg-gradient-to-r from-red-50 to-rose-50 text-red-600 hover:from-red-100 hover:to-rose-100 border border-red-200 hover:border-red-300'
                     }`}
                     title={rsvpStatus === 'not-going' ? 'Already Not Going' : 'Not Going'}
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
                     console.log('🔍 RSVP Button clicked - opening modal');
                     setShowRSVPModal(true);
                   }}
                   disabled={isBlockedFromRSVP}
                   className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-center relative z-10 ${
                     isBlockedFromRSVP
                       ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                       : rsvpStatus === 'going'
                       ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600'
                       : rsvpStatus === 'not-going'
                       ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white hover:from-red-600 hover:to-rose-600'
                       : 'bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:from-purple-700 hover:to-purple-800 hover:shadow-lg'
                   }`}
                 >
                   <span className="flex items-center justify-center w-full h-full">
                     {isBlockedFromRSVP 
                       ? 'RSVP Blocked' 
                       : rsvpStatus === 'going'
                       ? '✅ You\'re Going'
                       : rsvpStatus === 'not-going'
                       ? '❌ You\'re Not Going'
                       : 'RSVP Details'
                     }
                   </span>
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

            {/* Debug button for admins to fix attendee count */}
            {currentUser?.role === 'admin' && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={(e) => {
                  e.stopPropagation();
                  debugFixAttendeeCount();
                }}
                className="px-3 py-2 border-2 border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 hover:border-orange-400 transition-all duration-200 font-medium text-sm"
                title="Fix attendee count (recalculate from RSVPs)"
              >
                Fix Count
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
            // Refresh RSVP status after update
            if (currentUser) {
              const status = userRSVPs.find(r => r.eventId === event.id)?.status || null;
              setRsvpStatus(status);
            }
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