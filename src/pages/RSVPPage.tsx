import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  Heart,
  QrCode,
  UserPlus,
  Users,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AttendeeList } from '../components/events/AttendeeList';
import { LoadingButton } from '../components/ui/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';
import { useAttendees } from '../hooks/useAttendees';
import { EventDoc } from '../hooks/useEvents';
import { useFamilyMembers } from '../hooks/useFamilyMembers';
import { useUserBlocking } from '../hooks/useUserBlocking';
import { AgeGroup, AttendeeStatus, CreateAttendeeData, Relationship } from '../types/attendee';
import { FamilyMember } from '../types/family';

import { doc, onSnapshot } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../config/firebase';
// Import hooks
import { useCapacityState } from '../components/events/RSVPModalNew/hooks/useCapacityState';
import { useEventDates } from '../components/events/RSVPModalNew/hooks/useEventDates';
import { getCapacityBadgeClasses } from '../components/events/RSVPModalNew/rsvpUi';
import { useWaitlistPositions } from '../hooks/useWaitlistPositions';
// Import components
import { Helmet } from 'react-helmet-async';
import { AutoPromotionManager } from '../components/admin/AutoPromotionManager';
import { EventImage } from '../components/events/EventImage';
import { PaymentSection } from '../components/events/PaymentSection';
import { QRCodeTab } from '../components/events/QRCodeTab';
import { AttendeeInputRowMemo } from '../components/events/RSVPModalNew/components/AttendeeInputRow';
import { EventDetails } from '../components/events/RSVPModalNew/components/EventDetails';
import { Header } from '../components/events/RSVPModalNew/components/Header';
import { WhosGoingTab } from '../components/events/RSVPModalNew/components/WhosGoingTab';
import { createEventCanonicalUrl } from '../utils/seo';

const RSVPPage: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { blockedUsers } = useUserBlocking();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  
  // Real-time event loading with onSnapshot (NOT getDoc)
  const [event, setEvent] = useState<EventDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // ============================================================================
  // CRITICAL: All hooks must be called BEFORE any early returns
  // React Rules of Hooks require hooks to be called in the same order every render
  // ============================================================================
  
  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Reduced-motion aware transitions
  const prefersReduced = useReducedMotion();
  
  // Initialize all state hooks (must be unconditional)
  const [isAddSectionCollapsed, setIsAddSectionCollapsed] = useState(true);
  const [showFamilyMembers, setShowFamilyMembers] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'attendees' | 'qr' | 'whosGoing'>('attendees');
  const [familySizeInfo, setFamilySizeInfo] = useState<{ current: number; max: number; canAdd: boolean }>({ current: 0, max: 4, canAdd: true });
  const [isAdding, setIsAdding] = useState(false);
  
  // Use real-time event data for capacity state - initialize with safe fallback
  const [realTimeAttendingCount, setRealTimeAttendingCount] = useState<number>(0);
  
  // Ref to track previous family info - must be BEFORE early returns to maintain hook count
  const prevFamilyInfoRef = useRef<{ primaryGoing: boolean; familyCount: number } | null>(null);
  
  // Load event from URL using onSnapshot for real-time updates
  useEffect(() => {
    if (!eventId) {
      setError('Event ID not provided');
      setLoading(false);
      return;
    }

    const eventRef = doc(db, 'events', eventId);
    
    // Real-time listener for live updates (same pattern as EventDetailsPage)
    const unsubscribe = onSnapshot(
      eventRef,
      (eventSnap) => {
        if (eventSnap.exists()) {
          const eventData = eventSnap.data();
          const loadedEvent = { id: eventSnap.id, ...eventData } as EventDoc;
          setEvent(loadedEvent);
          setRealTimeAttendingCount(loadedEvent.attendingCount || 0);
          setError(null);
        } else {
          setError('Event not found');
        }
        setLoading(false);
      },
      (err) => {
        console.error('RSVPPage: Error fetching event:', err);
        setError('Failed to load event details');
        setLoading(false);
      }
    );

    // Cleanup listener on unmount
    return () => unsubscribe();
  }, [eventId]);

  // Update realTimeAttendingCount when event changes
  useEffect(() => {
    if (event?.attendingCount !== undefined) {
      setRealTimeAttendingCount(event.attendingCount);
    }
  }, [event?.attendingCount]);

  // Real-time listener for event document changes (attendingCount) - only when event exists
  // IMPORTANT: Only update attendingCount, NOT the entire event, to prevent infinite loops
  useEffect(() => {
    if (!event?.id) return;

    const eventRef = doc(db, 'events', event.id);
    const unsubscribe = onSnapshot(eventRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const newCount = data.attendingCount || 0;
        
        // Only update if count actually changed
        setRealTimeAttendingCount(prevCount => {
          if (prevCount !== newCount) {
            return newCount;
          }
          return prevCount;
        });
        
        // Only update event if attendingCount changed (not the entire event to prevent loops)
        setEvent(prevEvent => {
          if (prevEvent && prevEvent.attendingCount !== newCount) {
            return { ...prevEvent, attendingCount: newCount } as EventDoc;
          }
          return prevEvent;
        });
      }
    }, (error) => {
      console.error('RSVPPage: Error listening to event changes:', error);
    });

    return () => unsubscribe();
  }, [event?.id]);

  // Check if current user is the event creator (admin) or has admin role
  const isEventCreator = currentUser?.id === event?.createdBy;
  const isAdmin = currentUser?.role === 'admin' || isEventCreator;
  
  // Check if members are allowed to add attendees
  const canAddAttendees = isAdmin || (event?.allowMembersToAddAttendees === true);
  
  // Use our new date hook - safe fallback for null event
  const emptyEvent = useMemo(() => ({} as EventDoc), []);
  const { 
    isEventPast
  } = useEventDates(event || emptyEvent);
  
  // Event-dependent hooks - safe fallbacks for null event
  const { attendees, counts, addAttendee, bulkAddAttendees, refreshAttendees, updateAttendee, error: attendeesError } = useAttendees(
    event?.id || '',
    currentUser?.id || '',
    isAdmin
  );
  const { familyMembers } = useFamilyMembers();

  // Real-time waitlist positions - ONLY when waitlist is enabled
  const { positions: waitlistPositions, myPosition: waitlistPosition, waitlistCount } = useWaitlistPositions(
    event?.waitlistEnabled ? (event?.id || '') : '', 
    event?.waitlistEnabled ? currentUser?.id : undefined
  );

  // Define types and helper functions
  type BulkRow = {
    id: string;
    name: string;
    ageGroup: AgeGroup;
    relationship: Relationship;
    rsvpStatus: AttendeeStatus;
  };

  const makeId = () =>
    (globalThis as any).crypto?.randomUUID
      ? (globalThis as any).crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  // Bulk form data hook - must be unconditional
  const [bulkFormData, setBulkFormData] = useState<{ familyMembers: BulkRow[] }>(() => ({
    familyMembers: [
      {
        id: makeId(),
        name: '',
        ageGroup: 'adult',
        relationship: 'guest',
        rsvpStatus: 'going',
      },
    ],
  }));

  // Create capacity state using real-time count and waitlist data - BEFORE early returns
  const liveGoingCount = typeof counts.totalGoing === 'number' ? counts.totalGoing : realTimeAttendingCount;

  const mockCountsWithRealTime = useMemo(() => ({
    ...counts,
    totalGoing: liveGoingCount,
    goingCount: liveGoingCount,
    waitlistedCount: waitlistCount // Use real-time waitlist count
  }), [counts, liveGoingCount, waitlistCount]);

  // Use capacity state hook - safe fallbacks for null event
  const capacityState = useCapacityState(
    mockCountsWithRealTime, 
    event?.maxAttendees || 0, 
    event?.waitlistEnabled || false, 
    event?.waitlistLimit || undefined
  );

  // Blocked users check (non-hook, safe to call)
  const isBlockedFromRSVP = blockedUsers.some(
    (block) => block.blockCategory === 'rsvp_only' && block.isActive
  );

  // Calculate family size info - use ref to track previous values and prevent infinite loops
  // NOTE: prevFamilyInfoRef is already declared above (before early returns) to maintain hook count
  useEffect(() => {
    if (!currentUser) {
      setFamilySizeInfo({ current: 0, max: 4, canAdd: false });
      prevFamilyInfoRef.current = null;
      return;
    }

    // Find primary attendee
    const primaryAttendee = attendees.find(
      attendee => attendee.userId === currentUser.id && attendee.attendeeType === 'primary'
    );
    const isPrimaryGoing = primaryAttendee?.rsvpStatus === 'going';

    // Count family members
    const currentFamilyCount = attendees.filter(
      attendee => attendee.userId === currentUser.id && attendee.attendeeType === 'family_member'
    ).length;

    const maxFamilyMembers = 4;
    const canAddMore = isPrimaryGoing && currentFamilyCount < maxFamilyMembers;

    // Only update if values actually changed to prevent infinite loops
    const currentFamilyInfo = { primaryGoing: isPrimaryGoing, familyCount: currentFamilyCount };
    const prevFamilyInfo = prevFamilyInfoRef.current;
    
    if (
      !prevFamilyInfo ||
      prevFamilyInfo.primaryGoing !== isPrimaryGoing ||
      prevFamilyInfo.familyCount !== currentFamilyCount
    ) {
      prevFamilyInfoRef.current = currentFamilyInfo;
      setFamilySizeInfo({
        current: currentFamilyCount,
        max: maxFamilyMembers,
        canAdd: canAddMore
      });
    }
  }, [currentUser?.id, attendees]);

  // Memoize the ready to add count to prevent unnecessary re-renders
  const readyToAddCount = useMemo(() => 
    bulkFormData.familyMembers.filter((m) => m.name.trim()).length, 
    [bulkFormData.familyMembers]
  );

  const addBulkFormRow = useCallback(() => {
    setBulkFormData((prev) => ({
      familyMembers: [
        ...prev.familyMembers,
        { id: makeId(), name: '', ageGroup: 'adult', relationship: 'guest', rsvpStatus: 'going' },
      ],
    }));
  }, []);

  const removeBulkFormRow = useCallback((id: string) => {
    setBulkFormData((prev) => ({
      familyMembers:
        prev.familyMembers.length > 1
          ? prev.familyMembers.filter((m) => m.id !== id)
          : prev.familyMembers,
    }));
  }, []);

  const updateBulkFormField = useCallback((id: string, field: keyof BulkRow, value: string) => {
    setBulkFormData((prev) => ({
      familyMembers: prev.familyMembers.map((m) =>
        m.id === id ? ({ ...m, [field]: value } as BulkRow) : m
      ),
    }));
  }, []);

  // Helper functions (not hooks, but must be defined before early returns)
  const handleClose = useCallback(() => {
    // Always navigate to main events page for consistent UX across all devices
    navigate('/events');
  }, [navigate]);

  // Available family members (not a hook, but computed value)
  const availableFamilyMembers = useMemo(() => {
    if (!currentUser || !familyMembers) return [];
    return familyMembers.filter(
      (familyMember) =>
        !attendees.some(
          (attendee) =>
            attendee.userId === currentUser.id && attendee.familyMemberId === familyMember.id
        )
    );
  }, [currentUser?.id, familyMembers, attendees]);

  // ============================================================================
  // NOW safe to do early returns - all hooks have been called
  // ============================================================================
  
  // Return early if loading
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F25129] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading event...</p>
        </div>
      </div>
    );
  }

  // Return early if error or no event
  if (error || !event) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Event Not Found</h2>
          <p className="text-gray-600 mb-4">{error || 'The event you are looking for does not exist.'}</p>
          <button
            onClick={() => navigate('/events')}
            className="px-4 py-2 bg-[#F25129] text-white rounded-md hover:bg-[#E0451F] transition-colors"
          >
            Back to Events
          </button>
        </div>
      </div>
    );
  }

  // Return early if no user
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Sign In Required</h2>
          <p className="text-gray-600 mb-4">Please sign in to RSVP to events.</p>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-[#F25129] text-white rounded-md hover:bg-[#E0451F] transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  // Main component render (all hooks already called above)
  // Debug logging (safe - event exists after early returns)
  console.log('🚀 RSVPPage opened for event:', event.id, 'with config:', {
    maxAttendees: event.maxAttendees,
    waitlistEnabled: event.waitlistEnabled,
    waitlistLimit: event.waitlistLimit
  });
  
  // Debug admin status
  console.log('🔍 Admin Status Debug:', {
    currentUserId: currentUser?.id,
    userRole: currentUser?.role,
    eventCreatedBy: event.createdBy,
    isEventCreator,
    isAdmin
  });

  // Debug waitlist logic for troubleshooting (capacityState already calculated above)
  // NOTE: This runs after early returns, but it's just logging, not a hook
  // All hooks are already declared above before early returns

  const handleBulkAddFamilyMembers = async () => {
    if (!currentUser || bulkFormData.familyMembers.length === 0) return;
    const validMembers = bulkFormData.familyMembers.filter((m) => m.name.trim());
    if (validMembers.length === 0) return;

    // Check capacity before attempting to add
    if (!capacityState.canAddMore && !capacityState.canWaitlist) {
      toast.error('Event is at full capacity and waitlist is not available.');
      return;
    }

    // If event is full but waitlist is available, ask user
    if (!capacityState.canAddMore && capacityState.canWaitlist) {
      const shouldWaitlist = confirm('Event is full. Would you like to join the waitlist instead? You\'ll be notified if spots open up.');
      if (!shouldWaitlist) {
        return;
      }
      // Update form data to set waitlisted status
      setBulkFormData(prev => ({
        familyMembers: prev.familyMembers.map(m => 
          m.name.trim() ? { ...m, rsvpStatus: 'waitlisted' as AttendeeStatus } : m
        )
      }));
    }

    try {
      setIsAdding(true);
      
      // Check if primary member is already an attendee
      const existingPrimaryAttendee = attendees.find(
        attendee => attendee.userId === currentUser.id && attendee.attendeeType === 'primary'
      );
      
      const attendeesData: CreateAttendeeData[] = validMembers.map((member) => ({
        eventId: event.id,
        userId: currentUser.id,
        attendeeType: 'family_member',
        relationship: member.relationship || 'guest',
        name: member.name.trim(),
        ageGroup: member.ageGroup || 'adult',
        rsvpStatus: member.rsvpStatus || 'going',
      }));
      
      // Add primary member if not already exists, or update existing one to going
      if (!existingPrimaryAttendee) {
        attendeesData.unshift({
          eventId: event.id,
          userId: currentUser.id,
          attendeeType: 'primary',
          relationship: 'self',
          name: currentUser.displayName || `${currentUser.firstName} ${currentUser.lastName}`.trim() || 'You',
          ageGroup: 'adult',
          rsvpStatus: 'going',
        });
      } else if (existingPrimaryAttendee.rsvpStatus !== 'going') {
        // Update existing primary member to going status
        await updateAttendee(existingPrimaryAttendee.attendeeId, { rsvpStatus: 'going' });
        toast.success('You have been automatically set to "going" since family members are attending.');
      }
      
      await bulkAddAttendees(attendeesData);
      setBulkFormData({
        familyMembers: [{ id: makeId(), name: '', ageGroup: 'adult', relationship: 'guest', rsvpStatus: 'going' }],
      });
      await refreshAttendees();
      toast.success(`${validMembers.length} attendee(s) added successfully!${!existingPrimaryAttendee ? ' You have also been added as attending.' : ''}`);
    } catch (error) {
      console.error('Failed to add attendees:', error);
      toast.error('Failed to add attendees. Please try again.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddFamilyMember = async (familyMember: FamilyMember) => {
    if (!currentUser) return;
    try {
      setIsAdding(true);
      
      // Check if primary member is already an attendee
      const existingPrimaryAttendee = attendees.find(
        attendee => attendee.userId === currentUser.id && attendee.attendeeType === 'primary'
      );
      
      const attendeesToAdd: CreateAttendeeData[] = [];
      
      // Add family member
      attendeesToAdd.push({
        eventId: event.id,
        userId: currentUser.id,
        attendeeType: 'family_member',
        familyMemberId: familyMember.id,
        relationship: 'guest',
        name: familyMember.name,
        ageGroup: familyMember.ageGroup || 'adult',
        rsvpStatus: 'going',
      });
      
      // Add primary member if not already exists, or update existing one to going
      if (!existingPrimaryAttendee) {
        attendeesToAdd.push({
          eventId: event.id,
          userId: currentUser.id,
          attendeeType: 'primary',
          relationship: 'self',
          name: currentUser.displayName || `${currentUser.firstName} ${currentUser.lastName}`.trim() || 'You',
          ageGroup: 'adult',
          rsvpStatus: 'going',
        });
      } else if (existingPrimaryAttendee.rsvpStatus !== 'going') {
        // Update existing primary member to going status
        await updateAttendee(existingPrimaryAttendee.attendeeId, { rsvpStatus: 'going' });
        toast.success('You have been automatically set to "going" since a family member is attending.');
      }
      
      // Add family member (and primary if new)
      if (attendeesToAdd.length === 1) {
        await addAttendee(attendeesToAdd[0]);
      } else {
        await bulkAddAttendees(attendeesToAdd);
      }
      
      await refreshAttendees();
      toast.success(`${familyMember.name} added successfully!${!existingPrimaryAttendee ? ' You have also been added as attending.' : ''}`);
    } catch (error) {
      console.error('Failed to add family member:', error);
      toast.error('Failed to add family member. Please try again.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleBulkAddFromProfile = async (members: FamilyMember[]) => {
    if (!currentUser || members.length === 0) return;
    try {
      setIsAdding(true);
      
      // Check if primary member is already an attendee
      const existingPrimaryAttendee = attendees.find(
        attendee => attendee.userId === currentUser.id && attendee.attendeeType === 'primary'
      );
      
      const attendeesData: CreateAttendeeData[] = members.map((member) => ({
        eventId: event.id,
        userId: currentUser.id,
        attendeeType: 'family_member',
        familyMemberId: member.id,
        relationship: 'guest',
        name: member.name,
        ageGroup: member.ageGroup || 'adult',
        rsvpStatus: 'going',
      }));
      
      // Add primary member if not already exists, or update existing one to going
      if (!existingPrimaryAttendee) {
        attendeesData.unshift({
          eventId: event.id,
          userId: currentUser.id,
          attendeeType: 'primary',
          relationship: 'self',
          name: currentUser.displayName || `${currentUser.firstName} ${currentUser.lastName}`.trim() || 'You',
          ageGroup: 'adult',
          rsvpStatus: 'going',
        });
      } else if (existingPrimaryAttendee.rsvpStatus !== 'going') {
        // Update existing primary member to going status
        await updateAttendee(existingPrimaryAttendee.attendeeId, { rsvpStatus: 'going' });
        toast.success('You have been automatically set to "going" since family members are attending.');
      }
      
      await bulkAddAttendees(attendeesData);
      await refreshAttendees();
      toast.success(`${members.length} family members added successfully!${!existingPrimaryAttendee ? ' You have also been added as attending.' : ''}`);
    } catch (error) {
      console.error('Failed to add family members:', error);
      toast.error('Failed to add family members. Please try again.');
    } finally {
      setIsAdding(false);
    }
  };

  const canonicalUrl = event ? createEventCanonicalUrl(event) : '';

  return (
    <>
      {/* SEO: Canonical link pointing to Event Details Page (primary URL) */}
      {canonicalUrl && (
        <Helmet>
          <link rel="canonical" href={canonicalUrl} />
        </Helmet>
      )}
      
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          {/* Back Button */}
        <button
          onClick={handleClose}
          className="mb-4 text-[#F25129] hover:text-[#E0451F] flex items-center gap-2 transition-colors"
        >
          Back to Events
        </button>

        {/* Main Content Card */}
        <div className="bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden">
          {/* Event Hero Image (non-cropped) */}
          <EventImage
            src={event.imageUrl}
            alt={event.title || 'Event image'}
            fit="contain"
            aspect="16/9"
            title={event.title}
          />

          {/* Header Component */}
          <Header 
            event={event}
            onClose={handleClose}
            closeBtnRef={closeBtnRef}
            isCompact={isMobile}
            capacityState={capacityState}
          />
          
          {/* Event Details (Mobile only) */}
          <EventDetails 
            event={event}
            isMobile={isMobile}
          />

          {/* Tab Navigation */}
          <div className="px-6 py-3 border-b border-gray-200">
            <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('attendees')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'attendees'
                    ? 'bg-white text-[#F25129] shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Users className="w-4 h-4" />
                Your RSVP
              </button>
              <button
                onClick={() => setActiveTab('qr')}
                disabled={!event.attendanceEnabled}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'qr'
                    ? 'bg-white text-[#F25129] shadow-sm'
                    : !event.attendanceEnabled
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-600 hover:text-gray-900'
                }`}
                title={!event.attendanceEnabled ? 'QR Code not activated for this event' : ''}
              >
                <QrCode className="w-4 h-4" />
                QR Code
              </button>
              <button
                onClick={() => setActiveTab('whosGoing')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'whosGoing'
                    ? 'bg-white text-[#F25129] shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Users className="w-4 h-4" />
                Event Guests List
              </button>
            </div>
          </div>

          <div
            className="flex-1 min-h-0 overflow-y-auto pb-6 pr-2 rsvp-modal-scrollbar modalScroll"
            style={{ scrollbarGutter: 'stable both-edges', maxHeight: 'calc(100vh - 300px)' }}
          >
            {activeTab === 'qr' && event.attendanceEnabled ? (
              <div className="p-6">
                <QRCodeTab 
                  event={event} 
                  onEventUpdate={() => {
                    // Refresh event data when QR attendance is toggled
                    refreshAttendees();
                  }}
                />
              </div>
            ) : activeTab === 'qr' && !event.attendanceEnabled ? (
              <div className="p-6 text-center">
                <QrCode className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">QR Code Not Activated</h3>
                <p className="text-gray-600 mb-4">
                  QR code functionality is not enabled for this event.
                </p>
                <p className="text-sm text-gray-500">
                  Contact an administrator to enable QR code features.
                </p>
              </div>
            ) : activeTab === 'whosGoing' ? (
              <div className="p-6">
                <WhosGoingTab 
                  event={event}
                  attendees={attendees}
                  isAdmin={isAdmin}
                  waitlistPositions={waitlistPositions}
                />
              </div>
            ) : isBlockedFromRSVP ? (
              <div className="p-6 text-center">
                <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">RSVP Access Restricted</h3>
                <p className="text-gray-600">You are currently blocked from RSVPing to events. Please contact an administrator.</p>
              </div>
            ) : attendeesError ? (
              <div className="p-6 text-center">
                <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Error loading attendees</h3>
                <p className="text-gray-600 mb-4">{attendeesError}</p>
                <button
                  onClick={() => refreshAttendees()}
                  className="px-4 py-2 bg-[#F25129] text-white rounded-md hover:bg-[#E0451F] transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : isEventPast ? (
              <div className="p-6 text-center">
                <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Event Has Passed</h3>
                <p className="text-gray-600">This event has already occurred. RSVPs are no longer accepted.</p>
              </div>
            ) : (
              <div className="p-3">
                {/* Payment Section */}
                <PaymentSection 
                  event={event}
                  attendees={attendees.filter(attendee => attendee.userId === currentUser?.id)}
                  onPaymentComplete={() => {
                    refreshAttendees();
                  }}
                  onPaymentError={(error) => {
                    console.error('Payment error:', error);
                  }}
                />

                {isAdmin && (
                  <div className="mb-4">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-[15px] font-semibold text-gray-900">Manage Attendees</h3>
                      <div className="flex items-center gap-2 text-[12px] text-gray-600">
                        <span className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-green-500 rounded-full" />
                          <span>{counts.goingCount} Going</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-red-500 rounded-full" />
                          <span>{counts.notGoingCount} Not Going</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-purple-500 rounded-full" />
                          <span>{counts.waitlistedCount} Waitlisted</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                  {/* Add Attendees Section - Show based on event settings */}
                  <div className="bg-[#F25129]/10 border border-[#F25129]/20 rounded-lg mb-4">
                    <motion.button
                      id="add-attendees-trigger"
                      aria-expanded={!isAddSectionCollapsed}
                      aria-controls="add-attendees-panel"
                      onClick={() => canAddAttendees && setIsAddSectionCollapsed((v) => !v)}
                      disabled={!canAddAttendees}
                      className={`w-full p-3 flex items-center justify-between transition-colors ${
                        canAddAttendees ? 'hover:bg-[#F25129]/20 cursor-pointer' : 'opacity-50 cursor-not-allowed'
                      }`}
                      aria-label={`${isAddSectionCollapsed ? 'Expand' : 'Collapse'} Add Attendees section`}
                      title={!canAddAttendees ? 'Only admins can add attendees for this event' : undefined}
                    >
                      <div className="flex items-center gap-2">
                        <UserPlus className="w-4 h-4 text-[#F25129]" />
                        <h4 className="font-medium text-gray-900 text-[13px]">Add Attendees</h4>
                        {!canAddAttendees && (
                          <span className="text-[11px] text-gray-600 bg-gray-200 px-2 py-0.5 rounded">
                            Admin Only
                          </span>
                        )}
                        {canAddAttendees && (
                          <span className="text-[12px] text-gray-500">
                            ({readyToAddCount} ready to add)
                          </span>
                        )}
                      </div>
                      {canAddAttendees && (
                        <motion.div animate={{ rotate: isAddSectionCollapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
                          <ChevronDown className="w-5 h-5 text-gray-500" />
                        </motion.div>
                      )}
                    </motion.button>

                    {!isAddSectionCollapsed && canAddAttendees && (
                      <div className="px-4 pt-2">
                        {capacityState.isNearlyFull && (
                          <div className={`mb-3 p-3 rounded-lg text-sm ${getCapacityBadgeClasses(capacityState.state)}`}>
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4" />
                              <span className="font-medium">{capacityState.warningMessage}</span>
                            </div>
                            <p className="mt-1 text-xs opacity-90">
                              {waitlistPosition 
                                ? `You are waitlisted (#${waitlistPosition}). ${capacityState.slotsRemainingText}`
                                : capacityState.slotsRemainingText
                              }
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <AnimatePresence>
                      {!isAddSectionCollapsed && (
                        <motion.div
                          id="add-attendees-panel"
                          role="region"
                          aria-labelledby="add-attendees-trigger"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: 'easeInOut' }}
                          className="overflow-hidden"
                        >
                          <div className="p-2 pt-0">
                            {/* Table Header */}
                            <div className="border border-gray-200 rounded-lg overflow-hidden mb-2">
                              <div className="bg-gray-50 px-2.5 py-1.5 border-b border-gray-200">
                                <div className="grid grid-cols-12 gap-2 text-[12px] font-medium text-gray-600">
                                  <div className="col-span-4">Name</div>
                                  <div className="col-span-3">Age</div>
                                  <div className="col-span-3">Relation</div>
                                  <div className="col-span-2">Actions</div>
                                </div>
                              </div>
                              
                              {/* Table Body */}
                              <div className="divide-y divide-gray-100">
                                <div
                                  className="max-h-[180px] overflow-y-auto rsvp-modal-scrollbar modalScroll"
                                  style={{ scrollbarGutter: 'stable both-edges' }}
                                >
                                  {bulkFormData.familyMembers.map((member) => (
                                    <div 
                                      key={member.id}
                                      className="py-2"
                                    >
                                      <div className="px-2.5">
                                        <AttendeeInputRowMemo
                                          member={member}
                                          onUpdate={updateBulkFormField}
                                          onRemove={removeBulkFormRow}
                                          onAdd={addBulkFormRow}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 pt-3 border-t border-[#F25129]/20">
                              <button
                                onClick={handleBulkAddFamilyMembers}
                                disabled={
                                  isAdding || 
                                  bulkFormData.familyMembers.every((m) => !m.name.trim()) ||
                                  (!capacityState.canAddMore && !capacityState.canWaitlist)
                                }
                                className="w-full px-3.5 py-2 text-sm bg-[#F25129] text-white rounded-md hover:bg-[#E0451F] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {isAdding
                                  ? 'Adding...'
                                  : !capacityState.canAddMore && !capacityState.canWaitlist
                                    ? 'Event Full'
                                    : !capacityState.canAddMore && capacityState.canWaitlist
                                      ? `Join Waitlist (${readyToAddCount})`
                                      : `Add ${readyToAddCount} Attendee(s)`}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {familyMembers.length > 0 && (
                    <div className="bg-[#F25129]/10 border border-[#F25129]/20 rounded-lg mb-4">
                      <motion.button
                        id="family-members-trigger"
                        aria-expanded={showFamilyMembers}
                        aria-controls="family-members-panel"
                        onClick={() => setShowFamilyMembers((v) => !v)}
                        className="w-full p-3 flex items-center justify-between hover:bg-[#F25129]/20 transition-colors"
                        aria-label={`${showFamilyMembers ? 'Collapse' : 'Expand'} Family Members section`}
                      >
                        <div className="flex items-center gap-2">
                          <Heart className="w-4 h-4 text-[#F25129]" />
                          <h4 className="font-medium text-gray-900 text-[13px]">Add from Family Profile</h4>
                          <span className="text-[12px] text-gray-500">
                            ({availableFamilyMembers.length} available, {familySizeInfo.current}/{familySizeInfo.max} used)
                          </span>
                        </div>
                        <motion.div animate={{ rotate: showFamilyMembers ? 0 : 180 }} transition={{ duration: 0.2 }}>
                          <ChevronDown className="w-5 h-5 text-gray-500" />
                        </motion.div>
                      </motion.button>

                      <AnimatePresence>
                        {showFamilyMembers && (
                          <motion.div
                            id="family-members-panel"
                            role="region"
                            aria-labelledby="family-members-trigger"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                            className="overflow-hidden"
                          >
                            <div className="p-4 pt-0">
                              {!familySizeInfo.canAdd && (
                                <div className="mb-4 p-3 rounded-lg text-sm bg-yellow-50 border border-yellow-200">
                                  <div className="flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-yellow-600" />
                                    <span className="font-medium text-yellow-800">
                                      {familySizeInfo.current >= familySizeInfo.max 
                                        ? `Maximum family size reached (${familySizeInfo.max} family members)`
                                        : 'Primary member must be "going" to add family members'
                                      }
                                    </span>
                                  </div>
                                  <p className="mt-1 text-xs text-yellow-700">
                                    {familySizeInfo.current >= familySizeInfo.max 
                                      ? 'You can add up to 4 family members per event.'
                                      : 'Please set your status to "going" first, then you can add family members.'
                                    }
                                  </p>
                                </div>
                              )}

                              {capacityState.isNearlyFull && familySizeInfo.canAdd && (
                                <div className={`mb-4 p-3 rounded-lg text-sm ${getCapacityBadgeClasses(capacityState.state)}`}>
                                  <div className="flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" />
                                    <span className="font-medium">{capacityState.warningMessage}</span>
                                  </div>
                                  <p className="mt-1 text-xs opacity-90">
                                    {waitlistPosition 
                                      ? `You are waitlisted (#${waitlistPosition}). ${capacityState.slotsRemainingText}`
                                      : capacityState.slotsRemainingText
                                    }
                                  </p>
                                </div>
                              )}

                              {availableFamilyMembers.length > 0 ? (
                                <>
                                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                                    {/* Header row - hidden on mobile, visible on sm+ */}
                                    <div className="hidden sm:block bg-gray-50 px-3 py-2 border-b border-gray-200">
                                      <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-600">
                                        <div className="col-span-5">Name</div>
                                        <div className="col-span-3">Age</div>
                                        <div className="col-span-2">Status</div>
                                        <div className="col-span-2">Action</div>
                                      </div>
                                    </div>

                                    {/* Rows */}
                                    <div className="divide-y divide-gray-100">
                                      {availableFamilyMembers.map((familyMember, index) => (
                                        <div
                                          key={familyMember.id}
                                          className={`px-3 py-2 hover:bg-[#F25129]/10 transition-colors ${
                                            index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                                          }`}
                                        >
                                          {/* Stack on mobile, 12-col on sm+ */}
                                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                                            <div className="sm:col-span-5">
                                              <span className="font-medium text-gray-900 text-[13px]">{familyMember.name}</span>
                                            </div>
                                            <div className="sm:col-span-3 text-[12px] text-gray-500">
                                              {familyMember.ageGroup ? 
                                                (familyMember.ageGroup === 'adult' ? 'Adult' :
                                                 familyMember.ageGroup === '11+' ? '11+ Years' :
                                                 familyMember.ageGroup === '0-2' ? '0-2 Years' :
                                                 familyMember.ageGroup === '3-5' ? '3-5 Years' :
                                                 familyMember.ageGroup === '6-10' ? '6-10 Years' :
                                                 `${familyMember.ageGroup} years`) : 'Not set'}
                                            </div>
                                            <div className="sm:col-span-2">
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-800">
                                                Available
                                              </span>
                                            </div>
                                            <div className="sm:col-span-2">
                                              <button
                                                onClick={() => handleAddFamilyMember(familyMember)}
                                                disabled={isAdding || !familySizeInfo.canAdd}
                                                className="w-full px-2 py-1.5 text-[12px] bg-[#F25129] text-white rounded hover:bg-[#E0451F] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                              >
                                                {isAdding ? 'Adding...' : !familySizeInfo.canAdd ? 'Cannot Add' : 'Add'}
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="mt-4 pt-3 border-t border-[#F25129]/20">
                                    <LoadingButton
                                      loading={isAdding}
                                      disabled={!familySizeInfo.canAdd}
                                      onClick={() => handleBulkAddFromProfile(availableFamilyMembers)}
                                      className="w-full px-3.5 py-2 text-sm bg-[#F25129] text-white rounded-md hover:bg-[#E0451F] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                      {!familySizeInfo.canAdd ? 'Cannot Add Family Members' : `Add All ${availableFamilyMembers.length} Family Members`}
                                    </LoadingButton>
                                  </div>
                                </>
                              ) : (
                                <div className="text-center py-6">
                                  <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                                  <p className="text-gray-600 mb-2">All family members already added!</p>
                                  <p className="text-sm text-gray-500">
                                    Your family members from your profile have already been added to this event.
                                  </p>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <AttendeeList
                      eventId={event.id}
                      isAdmin={isAdmin}
                      waitlistPositions={waitlistPositions}
                      capacityState={capacityState}
                      onAttendeeUpdate={async () => {
                        try { await refreshAttendees(); } catch {}
                      }}
                    />
                  </div>

                  {event.description && (
                    <div className="mt-6 bg-gray-50 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-2">Event Details</h4>
                      <div className="relative">
                        <p className={`text-gray-700 leading-relaxed break-words ${!isDescriptionExpanded ? 'line-clamp-2' : ''}`}>
                          {event.description}
                        </p>
                        {event.description.length > 120 && (
                          <button
                            onClick={() => setIsDescriptionExpanded((v) => !v)}
                            className="text-[#F25129] hover:text-[#E0451F] text-sm font-medium mt-1"
                          >
                            {isDescriptionExpanded ? 'Show less' : 'View event details...'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Admin Tools */}
                  {isAdmin && (
                    <AutoPromotionManager
                      eventId={event.id}
                      eventTitle={event.title}
                      isAdmin={isAdmin}
                    />
                  )}
                </div>
            )}
          </div>

          <div className="border-t border-gray-200 p-4 bg-gray-50 mt-2 safe-footer">
            <div className="flex items-center justify-end">
              <div className="flex gap-3">
                <motion.button
                  whileHover={prefersReduced ? undefined : { scale: 1.05 }}
                  whileTap={prefersReduced ? undefined : { scale: 0.95 }}
                  onClick={handleClose}
                  className="px-3 py-1.5 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors text-[13px]"
                >
                  Close
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};

export default RSVPPage;
