import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  Clock,
  MapPin,
  QrCode,
  UserPlus,
  Users
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AttendeeList } from '../components/events/AttendeeList';
import { useAuth } from '../contexts/AuthContext';
import { useAttendees } from '../hooks/useAttendees';
import { EventDoc } from '../hooks/useEvents';
import { useUserBlocking } from '../hooks/useUserBlocking';
import { AgeGroup, Attendee, AttendeeStatus, CreateAttendeeData, Relationship } from '../types/attendee';

import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';
import { db } from '../config/firebase';
// Import hooks
import { useCapacityState } from '../components/events/RSVPModalNew/hooks/useCapacityState';
import { useEventDates } from '../components/events/RSVPModalNew/hooks/useEventDates';
import { getCapacityBadgeClasses } from '../components/events/RSVPModalNew/rsvpUi';
import { useWaitlistPositions } from '../hooks/useWaitlistPositions';
import { logAnalyticsEvent } from '../services/analyticsService';
// Import components
import { Helmet } from 'react-helmet-async';
import { AutoPromotionManager } from '../components/admin/AutoPromotionManager';
import { PaymentSection } from '../components/events/PaymentSection';
import { QRCodeTab } from '../components/events/QRCodeTab';
import { AttendeeInputRowMemo } from '../components/events/RSVPModalNew/components/AttendeeInputRow';
import { WhosGoingTab } from '../components/events/RSVPModalNew/components/WhosGoingTab';
import CommentSection from '../components/common/CommentSection';
import { OTPVerificationModal } from '../components/modals/OTPVerificationModal';
import { createEventCanonicalUrl } from '../utils/seo';

const generateGuestRowId = () =>
  (globalThis as any).crypto?.randomUUID
    ? (globalThis as any).crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const RSVPPage: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const { blockedUsers } = useUserBlocking();
  // Real-time event loading with onSnapshot (NOT getDoc)
  const [event, setEvent] = useState<EventDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loggedEventViewRef = useRef<string | null>(null);
  const paymentSectionRef = useRef<HTMLDivElement | null>(null);

  // ============================================================================
  // CRITICAL: All hooks must be called BEFORE any early returns
  // React Rules of Hooks require hooks to be called in the same order every render
  // ============================================================================

  // Initialize all state hooks (must be unconditional)
  const [isAddSectionCollapsed, setIsAddSectionCollapsed] = useState(false);
  const [isEventDetailsCollapsed, setIsEventDetailsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'attendees' | 'qr' | 'whosGoing'>('attendees');
  const [isAdding, setIsAdding] = useState(false);

  // Use real-time event data for capacity state - initialize with safe fallback
  const [realTimeAttendingCount, setRealTimeAttendingCount] = useState<number>(0);


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

  // Scroll to payment section when navigating with #payment
  useEffect(() => {
    if (location.hash !== '#payment') return;
    if (!paymentSectionRef.current) return;
    console.log('[RSVP] Navigated to payment section via hash', { eventId: event?.id });
    paymentSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash, event?.id]);

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
  const isGuestTrulyPublic = !currentUser && event?.visibility === 'truly_public';

  // Check if members are allowed to add attendees
  // Note: allowMembersToAddAttendees may exist on event but not in EventDoc type
  const allowMembersToAddAttendees = (event as any)?.allowMembersToAddAttendees;
  const canAddAttendees = isGuestTrulyPublic || isAdmin || (allowMembersToAddAttendees === true);

  // Guest RSVP modal state
  type GuestRow = { id: string; name: string; relationship: Relationship; ageGroup: AgeGroup };
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestCountryCode, setGuestCountryCode] = useState<'+1' | '+91'>('+1');
  const [guestPhone, setGuestPhone] = useState('');
      const [guestRows, setGuestRows] = useState<GuestRow[]>(() => [{ id: generateGuestRowId(), name: '', relationship: 'guest', ageGroup: 'adult' }]);
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const [guestSubmitted, setGuestSubmitted] = useState(false);
  const [guestMemberExists, setGuestMemberExists] = useState(false);
  const [guestAttendees, setGuestAttendees] = useState<Attendee[]>([]);
  // OTP Verification state for guest payments
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [guestSessionToken, setGuestSessionToken] = useState<string | null>(null);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [showAdditionalMembersForm, setShowAdditionalMembersForm] = useState(false);
  const normalizeGuestPhoneToE164OrNull = useCallback((input: string): string | null => {
    const raw = (input || '').trim();
    if (!raw) return null;

    if (raw.startsWith('+')) {
      const cleaned = raw.replace(/[^\d+]/g, '');
      return /^\+[1-9]\d{6,14}$/.test(cleaned) ? cleaned : null;
    }

    const digits = raw.replace(/\D/g, '');
    if (!digits) return null;

    if (guestCountryCode === '+1') {
      if (digits.length === 10) return `+1${digits}`;
      if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
      return null;
    }

    if (guestCountryCode === '+91') {
      if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
      if (digits.length === 12 && digits.startsWith('91') && /^[6-9]\d{9}$/.test(digits.slice(2))) return `+${digits}`;
      return null;
    }

    return null;
  }, [guestCountryCode]);

  const guestContactReady = useMemo(() => {
    const firstName = guestFirstName.trim();
    const lastName = guestLastName.trim();
    const email = guestEmail.trim().toLowerCase();
    const phoneE164 = normalizeGuestPhoneToE164OrNull(guestPhone);
    return Boolean(firstName && lastName && email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && phoneE164);
  }, [guestEmail, guestFirstName, guestLastName, guestPhone, normalizeGuestPhoneToE164OrNull]);
  const guestAdditionalCount = useMemo(
    () => guestRows.filter((row) => row.name.trim().length > 0).length,
    [guestRows]
  );
  const guestFamilyCount = useMemo(
    () => guestRows.filter((row) => row.name.trim().length > 0 && row.relationship !== 'guest').length,
    [guestRows]
  );
  const guestOnlyCount = useMemo(
    () => guestRows.filter((row) => row.name.trim().length > 0 && row.relationship === 'guest').length,
    [guestRows]
  );

  useEffect(() => {
    if (!event?.id) return;
    if (loggedEventViewRef.current === event.id) return;
    loggedEventViewRef.current = event.id;

    logAnalyticsEvent({
      eventType: 'event_view',
      eventId: event.id,
      page: window.location.pathname,
      userId: currentUser?.id,
      guestEmail: guestEmail || undefined,
      userType: currentUser?.role || (isGuestTrulyPublic ? 'guest' : 'anonymous'),
      metadata: {
        eventTitle: event.title,
        eventTags: event.tags || [],
        eventCategory: event.tags?.[0] || 'uncategorized',
        source: 'rsvp_page',
      },
    });
  }, [event?.id, event?.title, currentUser?.id, currentUser?.role, isGuestTrulyPublic, guestEmail]);

  // No local caching for guest RSVP data. Firestore is the source of truth.

  // Debug log to verify event settings
  useEffect(() => {
    if (event?.id) {
      console.log('🔍 RSVPPage - Event settings check:', {
        eventId: event.id,
        isAdmin,
        allowMembersToAddAttendees,
        canAddAttendees,
        maxAttendees: event.maxAttendees,
        attendingCount: event.attendingCount
      });
    }
  }, [event?.id, isAdmin, allowMembersToAddAttendees, canAddAttendees, event?.maxAttendees, event?.attendingCount]);

  // Use our new date hook - safe fallback for null event
  const emptyEvent = useMemo(() => ({} as EventDoc), []);
  const {
    isEventPast
  } = useEventDates(event || emptyEvent);

  // Event-dependent hooks - safe fallbacks for null event
  const { attendees, counts, bulkAddAttendees, refreshAttendees, updateAttendee, error: attendeesError } = useAttendees(
    event?.id || '',
    currentUser?.id || '',
    isAdmin
  );

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

  // Bulk form data hook - must be unconditional
  const [bulkFormData, setBulkFormData] = useState<{ familyMembers: BulkRow[] }>(() => ({
    familyMembers: [
      {
        id: generateGuestRowId(),
        name: '',
        ageGroup: 'adult',
        relationship: 'guest',
        rsvpStatus: 'going',
      },
    ],
  }));

  // Modal state for non-refundable warning
  const [showNonRefundableModal, setShowNonRefundableModal] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    attendeeId: string;
    status: AttendeeStatus;
  } | null>(null);

  // Create capacity state using real-time count and waitlist data - BEFORE early returns
  // CRITICAL: Always use realTimeAttendingCount for capacity checks, NOT counts.totalGoing
  // because counts.totalGoing only includes the current user's attendees, not all attendees
  // For a user who hasn't RSVP'd, counts.totalGoing would be 0, causing incorrect capacity checks
  const liveGoingCount = realTimeAttendingCount;

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

  // Capacity UI state - improved state handling
  const capacityUI = useMemo(() => {
    if (!capacityState) return null;

    if (!capacityState.canAddMore && !capacityState.canWaitlist) {
      return {
        tone: 'error' as const,
        title: 'Event is Full',
        subtitle: 'No more RSVPs can be accepted.',
      };
    }

    if (!capacityState.canAddMore && capacityState.canWaitlist) {
      return {
        tone: 'warning' as const,
        title: 'Event is Full — Waitlist Available',
        subtitle: 'Join the waitlist and you\'ll be auto-notified if a spot opens.',
        showWaitlistPosition: true,
      };
    }

    if (capacityState.isNearlyFull) {
      return {
        tone: 'info' as const,
        title: 'Limited Spots Remaining',
        subtitle: capacityState.slotsRemainingText || 'Hurry! Spots are filling up fast.',
      };
    }

    return null;
  }, [capacityState]);

  // Blocked users check (non-hook, safe to call)
  const isBlockedFromRSVP = blockedUsers.some(
    (block) => block.blockCategory === 'rsvp_only' && block.isActive
  );


  // Memoize the ready to add count to prevent unnecessary re-renders
  const readyToAddCount = useMemo(() =>
    bulkFormData.familyMembers.filter((m) => m.name.trim()).length,
    [bulkFormData.familyMembers]
  );

  const addBulkFormRow = useCallback(() => {
    setBulkFormData((prev) => ({
      familyMembers: [
        ...prev.familyMembers,
        { id: generateGuestRowId(), name: '', ageGroup: 'adult', relationship: 'guest', rsvpStatus: 'going' },
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

  // Return early if no user and event is not truly public
  if (!currentUser && event?.visibility !== 'truly_public') {
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

  // Helper function to update primary member and cascade to family members
  const handleCascadingStatusUpdate = async (attendeeId: string, newStatus: AttendeeStatus) => {
    const attendeeToUpdate = attendees.find(a => a.attendeeId === attendeeId);
    if (!attendeeToUpdate) return;

    // Update the primary/target attendee
    await updateAttendee(attendeeId, { rsvpStatus: newStatus });

    // If this is a primary member changing to "not-going", cascade to family members
    if (attendeeToUpdate.attendeeType === 'primary' && newStatus === 'not-going') {
      const familyMembers = attendees.filter(
        a => a.userId === attendeeToUpdate.userId &&
          a.attendeeType === 'family_member' &&
          a.rsvpStatus === 'going'
      );

      if (familyMembers.length > 0) {
        toast.loading(`Updating ${familyMembers.length} family member(s)...`);

        // Update all family members to not-going
        await Promise.all(
          familyMembers.map(member =>
            updateAttendee(member.attendeeId, { rsvpStatus: 'not-going' })
          )
        );

        toast.dismiss();
        toast.success(`Updated ${familyMembers.length} family member(s) to Not Going`);
      }
    }

    await refreshAttendees();
  };

  const addGuestFamilyRow = () => {
    setGuestRows((prev) => [...prev, { id: generateGuestRowId(), name: '', relationship: 'spouse', ageGroup: 'adult' }]);
  };

  const addGuestOnlyRow = () => {
    setGuestRows((prev) => [...prev, { id: generateGuestRowId(), name: '', relationship: 'guest', ageGroup: 'adult' }]);
  };

  // Handler for verifying phone BEFORE RSVP submission
  const handleVerifyPhone = () => {
    const firstName = guestFirstName.trim();
    const lastName = guestLastName.trim();
    const email = guestEmail.trim().toLowerCase();
    const phoneE164 = normalizeGuestPhoneToE164OrNull(guestPhone);

    // Validate contact info before showing OTP modal
    if (!firstName || !lastName) { toast.error('First and last name are required'); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error('Please enter a valid email address'); return; }
    if (!phoneE164) { toast.error(`Please enter a valid ${guestCountryCode} phone number`); return; }

    // Clear any previous guest state before starting a new verification flow
    setGuestAttendees([]);
    setGuestSubmitted(false);
    setGuestMemberExists(false);
    setGuestSessionToken(null);
    setIsPhoneVerified(false);
    setShowAdditionalMembersForm(false);

    // Open OTP modal for verification
    setShowOTPModal(true);
  };

  // Handler for OTP verification success
  const handleOTPVerified = async (sessionToken: string) => {
    console.log('[FRONTEND] OTP Verified! Session token received');
    console.log('[FRONTEND] Session token (first 10 chars):', sessionToken?.substring(0, 10) + '...');
    console.log('[FRONTEND] Session token length:', sessionToken?.length);
    setGuestSessionToken(sessionToken);
    setIsPhoneVerified(true);
    setShowAdditionalMembersForm(true);
    toast.success('Phone verified! You can now add additional members and submit your RSVP.');

    if (!event?.id) return;
    const phoneE164 = normalizeGuestPhoneToE164OrNull(guestPhone);
    if (!phoneE164) return;
    const phoneDigits = phoneE164.replace(/[^\d]/g, '');
    const guestUserId = `guest_${event.id}_${phoneDigits}`;

    try {
      console.log('[GUEST] Fetching existing guest attendees after OTP verify');
      const existing = await fetchGuestAttendeesFromFirestore(event.id, guestUserId, phoneE164);
      if (existing.length > 0) {
        setGuestAttendees(existing);
        setGuestSubmitted(true);
        setGuestRows([{ id: generateGuestRowId(), name: '', relationship: 'guest', ageGroup: 'adult' }]);
        console.log('[GUEST] Existing attendees loaded:', existing.map(a => ({ id: a.attendeeId, paymentStatus: a.paymentStatus })));
      }
    } catch (error) {
      console.error('[GUEST] Failed to fetch attendees after OTP verify:', error);
    }
  };

  const fetchGuestAttendeesFromFirestore = async (
    targetEventId: string,
    targetGuestUserId: string | undefined,
    targetGuestPhone: string | undefined
  ): Promise<Attendee[]> => {
    if (!targetEventId) return [];

    const attendeesRef = collection(db, 'events', targetEventId, 'attendees');
    let snapshot = targetGuestUserId
      ? await getDocsFromServer(query(attendeesRef, where('userId', '==', targetGuestUserId), where('rsvpStatus', '==', 'going')))
      : null;

    if (!snapshot || snapshot.empty) {
      if (targetGuestPhone) {
        snapshot = await getDocsFromServer(query(attendeesRef, where('guestPhone', '==', targetGuestPhone), where('rsvpStatus', '==', 'going')));
      }
    }

    if (!snapshot || snapshot.empty) return [];

    return snapshot.docs.map((attendeeSnap) => {
      const data = attendeeSnap.data();
      return {
        attendeeId: attendeeSnap.id,
        eventId: targetEventId,
        userId: data.userId,
        attendeeType: data.attendeeType,
        relationship: data.relationship,
        name: data.name,
        ageGroup: data.ageGroup,
        rsvpStatus: data.rsvpStatus,
        paymentStatus: data.paymentStatus || 'unpaid',
        createdAt: data.createdAt?.toDate?.() || new Date(),
        updatedAt: data.updatedAt?.toDate?.() || new Date(),
      } as Attendee;
    });
  };

  // Function to refresh guest attendees from Firestore
  const refreshGuestAttendees = async (): Promise<Attendee[]> => {
    if (!event?.id || guestAttendees.length === 0) return;

    try {
      console.log('🔄 [GUEST] Refreshing guest attendees from Firestore');
      const attendeeIds = guestAttendees.map(a => a.attendeeId);

      // Fetch updated attendee data from Firestore
      const updatedAttendees: Attendee[] = [];
      for (const attendeeId of attendeeIds) {
        const attendeeRef = doc(db, 'events', event.id, 'attendees', attendeeId);
        const attendeeSnap = await getDocFromServer(attendeeRef);

        if (attendeeSnap.exists()) {
          const data = attendeeSnap.data();
          updatedAttendees.push({
            attendeeId: attendeeSnap.id,
            eventId: event.id,
            userId: data.userId,
            attendeeType: data.attendeeType,
            relationship: data.relationship,
            name: data.name,
            ageGroup: data.ageGroup,
            rsvpStatus: data.rsvpStatus,
            paymentStatus: data.paymentStatus,
            createdAt: data.createdAt?.toDate?.() || new Date(),
            updatedAt: data.updatedAt?.toDate?.() || new Date(),
          });
        }
      }

      let finalAttendees = updatedAttendees;

      if (updatedAttendees.length !== attendeeIds.length) {
        console.warn('⚠️ [GUEST] Some attendee IDs missing. Falling back to query by userId/guestPhone.');
        const phoneE164 = normalizeGuestPhoneToE164OrNull(guestPhone);
        const fallback = await fetchGuestAttendeesFromFirestore(
          event.id,
          guestAttendees[0]?.userId,
          phoneE164 || undefined
        );
        if (fallback.length > 0) {
          finalAttendees = fallback;
        }
      }

      console.log('✅ [GUEST] Refreshed attendees:', finalAttendees.map(a => ({ id: a.attendeeId, paymentStatus: a.paymentStatus })));
      setGuestAttendees(finalAttendees);

      // No local caching
      return finalAttendees;
    } catch (error) {
      console.error('❌ [GUEST] Error refreshing guest attendees:', error);
      return guestAttendees;
    }
  };

  const handleSubmitGuestRsvp = async () => {
    if (!event?.id) return;
    if (!isPhoneVerified) {
      toast.error('Please verify your phone number first');
      return;
    }

    const firstName = guestFirstName.trim();
    const lastName = guestLastName.trim();
    const email = guestEmail.trim().toLowerCase();
    const phoneE164 = normalizeGuestPhoneToE164OrNull(guestPhone);

    // Additional validation (should never happen since phone was verified)
    if (!phoneE164) {
      toast.error('Invalid phone number');
      return;
    }

      const additionalAttendees = guestRows
        .map((r) => ({ name: r.name.trim(), relationship: (r.relationship || 'guest') as Relationship, ageGroup: (r.ageGroup || 'adult') as AgeGroup }))
        .filter((r) => r.name.length > 0);

    try {
      setGuestSubmitting(true);
      setGuestMemberExists(false);
      const fn = httpsCallable<
        { eventId: string; guest: { firstName: string; lastName: string; email: string; phoneNumber: string }; additionalAttendees: Array<{ name: string; relationship: string; ageGroup: string }> },
        { success: boolean; memberExists?: boolean; message?: string; error?: string; attendeeIds?: string[]; guestUserId?: string; attendees?: Array<{ name: string; relationship: string; attendeeType: 'primary' | 'family_member'; ageGroup: string }> }
      >(getFunctions(undefined, 'us-east1'), 'submitTrulyPublicGuestRsvp');

      const result = await fn({ eventId: event.id, guest: { firstName, lastName, email, phoneNumber: phoneE164 }, additionalAttendees });

      if (!result.data?.success) {
        if (result.data?.memberExists) {
          setGuestMemberExists(true);
          toast.error(result.data?.message || 'You are already a member. Please login.');
          return;
        }
        toast.error(result.data?.error || result.data?.message || 'Unable to submit RSVP');
        return;
      }

      // Always re-fetch from Firestore to get real paymentStatus (avoid re-marking paid as unpaid)
      const guestUserId = result.data.guestUserId || `guest-${email}`;

      let finalAttendees = await fetchGuestAttendeesFromFirestore(
        event.id,
        guestUserId,
        phoneE164
      );

      // If Firestore fetch returns nothing (edge case), fall back to backend response
      if (finalAttendees.length === 0) {
        const returnedIds = result.data.attendeeIds || [];
        const serverAttendees = result.data.attendees && result.data.attendees.length > 0
          ? result.data.attendees
          : [{ name: `${firstName} ${lastName}`, relationship: 'self', attendeeType: 'primary' as const, ageGroup: 'adult' as AgeGroup }, ...additionalAttendees.map(a => ({ name: a.name, relationship: a.relationship, attendeeType: 'family_member' as const, ageGroup: a.ageGroup }))];
        const built: Attendee[] = serverAttendees.map((m, i) => ({
          attendeeId: returnedIds[i] || '',
          eventId: event.id,
          userId: guestUserId,
          attendeeType: m.attendeeType,
          relationship: m.relationship as Relationship,
          name: m.name,
          ageGroup: m.ageGroup,
          rsvpStatus: 'going',
          paymentStatus: 'unpaid',
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
        finalAttendees = built.filter(a => a.attendeeId);
      }

      setGuestAttendees(finalAttendees);
      setGuestSubmitted(true);
      setGuestRows([{ id: generateGuestRowId(), name: '', relationship: 'guest', ageGroup: 'adult' }]);

      console.log('✅ [FRONTEND] RSVP Submitted! Session token still available:', guestSessionToken ? 'YES' : 'NO');
      if (guestSessionToken) {
        console.log('✅ [FRONTEND] Session token (first 10 chars):', guestSessionToken.substring(0, 10) + '...');
      }
      toast.success(result.data?.message || 'RSVP submitted successfully!');
    } catch (err: any) {
      console.error('Failed to submit guest RSVP:', err);
      toast.error(err?.message || 'Unable to submit RSVP');
    } finally {
      setGuestSubmitting(false);
    }
  };

  const handleBulkAddFamilyMembers = async () => {
    if (!canAddAttendees) {
      toast.error('This event is restricted to members. Please contact the host.');
      return;
    }
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
        familyMembers: [{ id: generateGuestRowId(), name: '', ageGroup: 'adult', relationship: 'guest', rsvpStatus: 'going' }],
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


  const canonicalUrl = event ? createEventCanonicalUrl(event) : '';

  return (
    <>
      {/* SEO: Canonical link pointing to Event Details Page (primary URL) */}
      {canonicalUrl && (
        <Helmet>
          <link rel="canonical" href={canonicalUrl} />
        </Helmet>
      )}

      {/* Mobile-First Design - Clean, No Nested Containers */}
      <div className="min-h-screen bg-gray-50">
        {/* Sticky Top Bar - Removed back arrow and RSVP text */}
        <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-2xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3">
            {/* Empty header - back navigation removed per user request */}
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4">
          {/* Event Title - Centered with consistent styling from other pages */}
          <div className="text-center mb-6 sm:mb-8 pt-6 sm:pt-8">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent leading-relaxed pb-1">
              {event.title}
            </h1>
          </div>
          {/* Capacity Status Banner - Improved state handling */}
          {capacityUI && (
            <div className="mb-4">
              <div
                className={`rounded-xl border px-4 py-3 ${capacityUI.tone === 'error'
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : capacityUI.tone === 'warning'
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-blue-50 border-blue-200 text-blue-900'
                  }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">
                    <AlertTriangle
                      className={`w-5 h-5 ${capacityUI.tone === 'error'
                        ? 'text-red-600'
                        : capacityUI.tone === 'warning'
                          ? 'text-amber-600'
                          : 'text-blue-600'
                        }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm leading-tight">{capacityUI.title}</div>
                    <div className="text-xs sm:text-sm mt-0.5 opacity-90">{capacityUI.subtitle}</div>
                    {capacityUI.showWaitlistPosition && waitlistPosition && (
                      <div className="text-xs mt-1.5 opacity-80 font-medium">
                        Your waitlist position: #{waitlistPosition}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Event Details Section - Collapsible with dropdown */}
          <div className="mb-4">
            <div className="bg-gradient-to-br from-[#FFF5F2] to-[#FFE08A]/30 border border-[#F25129]/20 rounded-lg overflow-hidden">
              <motion.button
                onClick={() => setIsEventDetailsCollapsed((v) => !v)}
                className="w-full p-3 sm:p-4 flex items-center justify-between touch-manipulation active:bg-[#F25129]/5 cursor-pointer"
                aria-expanded={!isEventDetailsCollapsed}
                aria-label={`${isEventDetailsCollapsed ? 'Expand' : 'Collapse'} Event Details`}
              >
                <div className="flex items-center gap-2 sm:gap-3 flex-1">
                  <div className="p-1.5 sm:p-2 bg-white rounded-lg shadow-sm">
                    <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-[#F25129]" />
                  </div>
                  <div className="text-left flex-1">
                    <h4 className="font-semibold text-gray-900 text-xs sm:text-sm">Event Details</h4>
                    {event.startAt && (
                      <span className="text-xs text-[#F25129] font-medium">
                        {new Date(event.startAt.seconds * 1000).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        })}
                        {event.startAt && (
                          ` at ${new Date(event.startAt.seconds * 1000).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}`
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <motion.div animate={{ rotate: isEventDetailsCollapsed ? 0 : 180 }} transition={{ duration: 0.3 }}>
                  <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-[#F25129]" />
                </motion.div>
              </motion.button>

              {!isEventDetailsCollapsed && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="border-t border-blue-200"
                >
                  <div className="bg-white rounded-b-lg p-4 sm:p-5">
                    <div className="space-y-3">
                      {/* Date - Orange icon background */}
                      {event.startAt && (
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-[#F25129]/10 rounded-lg flex-shrink-0 shadow-sm">
                            <Calendar className="w-5 h-5 text-[#F25129]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900 break-words">
                              {new Date(event.startAt.seconds * 1000).toLocaleDateString('en-US', {
                                weekday: 'long',
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </div>
                            <div className="text-xs text-gray-600 mt-0.5">
                              {new Date(event.startAt.seconds * 1000).toLocaleDateString('en-US', { weekday: 'long' })}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Time - Yellow icon background */}
                      {event.startAt && (
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-[#FFC107]/20 rounded-lg flex-shrink-0 shadow-sm">
                            <Clock className="w-5 h-5 text-[#FFC107]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900 break-words">
                              {new Date(event.startAt.seconds * 1000).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              })}
                              {event.endAt && ` - ${new Date(event.endAt.seconds * 1000).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              })}`}
                            </div>
                            {event.startAt && event.endAt && (
                              <div className="text-xs text-gray-600 mt-0.5">
                                {Math.round((event.endAt.seconds - event.startAt.seconds) / 3600)} hour
                                {Math.round((event.endAt.seconds - event.startAt.seconds) / 3600) !== 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Location - Orange icon background */}
                      {(event.venueName || event.venueAddress || event.location) && (
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-[#F25129]/10 rounded-lg flex-shrink-0 shadow-sm">
                            <MapPin className="w-5 h-5 text-[#F25129]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900 break-words">
                              {event.location || (event.venueName && event.venueAddress
                                ? `${event.venueName}, ${event.venueAddress}`
                                : event.venueName || event.venueAddress || '')}
                            </div>
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                event.location || (event.venueName && event.venueAddress
                                  ? `${event.venueName}, ${event.venueAddress}`
                                  : event.venueName || event.venueAddress || '')
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-[#F25129] hover:text-[#E0451F] hover:underline mt-0.5 inline-flex items-center gap-1 touch-manipulation"
                              style={{ WebkitTapHighlightColor: 'transparent' }}
                            >
                              Get Directions
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Description */}
                      {event.description && (
                        <div className="pt-3 border-t border-gray-200">
                          <div className="font-semibold text-gray-900 text-xs uppercase tracking-wide mb-2">DESCRIPTION</div>
                          <p className="text-sm text-gray-700 leading-relaxed break-words whitespace-pre-wrap">
                            {event.description}
                          </p>
                        </div>
                      )}

                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* Tab Navigation - Clean Mobile Design */}
          <div className="bg-white border-b border-gray-200">
            <div className="max-w-2xl mx-auto px-4 flex">
              <button
                onClick={() => setActiveTab('attendees')}
                className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-semibold transition-all touch-manipulation ${activeTab === 'attendees'
                  ? 'text-[#F25129] border-b-2 border-[#F25129] bg-orange-50/30'
                  : 'text-gray-600 border-b-2 border-transparent active:bg-gray-50'
                  }`}
              >
                <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden xs:inline sm:inline">Your RSVP</span>
                <span className="xs:hidden">RSVP</span>
              </button>
              <button
                onClick={() => setActiveTab('qr')}
                disabled={!event.attendanceEnabled}
                className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-semibold transition-all touch-manipulation ${activeTab === 'qr'
                  ? 'text-[#F25129] border-b-2 border-[#F25129] bg-orange-50/30'
                  : !event.attendanceEnabled
                    ? 'text-gray-300 cursor-not-allowed border-b-2 border-transparent'
                    : 'text-gray-600 border-b-2 border-transparent active:bg-gray-50'
                  }`}
                title={!event.attendanceEnabled ? 'QR Code not activated' : ''}
              >
                <QrCode className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden xs:inline sm:inline">QR Code</span>
                <span className="xs:hidden">QR</span>
              </button>
              <button
                onClick={() => setActiveTab('whosGoing')}
                className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-semibold transition-all touch-manipulation ${activeTab === 'whosGoing'
                  ? 'text-[#F25129] border-b-2 border-[#F25129] bg-orange-50/30'
                  : 'text-gray-600 border-b-2 border-transparent active:bg-gray-50'
                  }`}
              >
                <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Event Guests List</span>
              </button>
            </div>
          </div>

          {/* Content Wrapper */}
          <div className="bg-white">
            <div className="max-w-2xl mx-auto px-4">
              {activeTab === 'qr' && event.attendanceEnabled ? (
                <div className="px-4 py-6">
                  <QRCodeTab
                    event={event}
                    onEventUpdate={() => {
                      refreshAttendees();
                    }}
                  />
                </div>
              ) : activeTab === 'qr' && !event.attendanceEnabled ? (
                <div className="px-4 py-12 text-center">
                  <QrCode className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-900 mb-2">QR Code Not Activated</h3>
                  <p className="text-sm text-gray-600">
                    QR code functionality is not enabled for this event.
                  </p>
                </div>
              ) : activeTab === 'whosGoing' ? (
                <div className="px-4 py-6">
                  <WhosGoingTab
                    event={event}
                    attendees={attendees}
                    isAdmin={isAdmin}
                    waitlistPositions={waitlistPositions}
                  />
                </div>
              ) : isBlockedFromRSVP ? (
                <div className="px-4 py-12 text-center">
                  <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-900 mb-2">RSVP Access Restricted</h3>
                  <p className="text-sm text-gray-600">You are currently blocked from RSVPing to events. Please contact an administrator.</p>
                </div>
              ) : attendeesError ? (
                <div className="px-4 py-12 text-center">
                  <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Error loading attendees</h3>
                  <p className="text-sm text-gray-600 mb-4">{attendeesError}</p>
                  <button
                    onClick={() => refreshAttendees()}
                    className="px-6 py-3 bg-[#F25129] text-white rounded-lg font-semibold active:scale-95 transition-transform"
                  >
                    Retry
                  </button>
                </div>
              ) : isEventPast ? (
                <div className="px-4 py-12 text-center">
                  <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Event Has Passed</h3>
                  <p className="text-sm text-gray-600">This event has already occurred. RSVPs are no longer accepted.</p>
                </div>
              ) : (
                <div className="px-4 py-4">
                    {/* Payment Section */}
                    <div id="payment" ref={paymentSectionRef}>
                      {isGuestTrulyPublic && !guestSubmitted && (
                        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                          <p className="text-xs font-medium text-blue-800">
                            RSVP first in the section below. Payment options will activate after RSVP submission.
                          </p>
                        </div>
                      )}
                      <PaymentSection
                        event={event}
                        attendees={isGuestTrulyPublic ? guestAttendees : attendees.filter(attendee => attendee.userId === currentUser?.id)}
                        onPaymentComplete={async () => {
                          if (isGuestTrulyPublic) {
                            const updated = await refreshGuestAttendees();
                            if (updated && updated.length > 0) {
                              setGuestSubmitted(true);
                            }
                          } else {
                            refreshAttendees();
                          }
                        }}
                        onPaymentError={(error) => { console.error('Payment error:', error); }}
                        isGuest={isGuestTrulyPublic}
                        guestUserId={isGuestTrulyPublic ? guestAttendees[0]?.userId : undefined}
                        guestEmail={isGuestTrulyPublic ? guestEmail : undefined}
                        sessionToken={isGuestTrulyPublic ? (guestSessionToken || undefined) : undefined}
                        onDeleteGuestAttendee={isGuestTrulyPublic ? async (attendeeId) => {
                          try {
                            if (!guestSessionToken) {
                              toast.error('Session expired. Please verify your phone again.');
                              return;
                            }
                            const fn = httpsCallable<
                              { sessionToken: string; eventId: string; attendeeId: string },
                              { success: boolean }
                            >(getFunctions(undefined, 'us-east1'), 'deleteGuestAttendee');
                            await fn({ sessionToken: guestSessionToken, eventId: event.id, attendeeId });
                            await refreshGuestAttendees();
                          } catch (error) {
                            console.error('❌ Failed to delete guest attendee:', error);
                            toast.error('Failed to remove attendee. Please try again.');
                          }
                        } : undefined}
                      />
                    </div>

                  {isGuestTrulyPublic && guestSubmitted && (
                    <div className="mb-3 sm:mb-4 bg-emerald-50 border border-emerald-200 rounded-lg p-3 sm:p-4">
                      <p className="text-sm text-emerald-700 font-medium">✓ RSVP submitted! Complete payment below if required.</p>
                    </div>
                  )}

                  <div className="mb-3 sm:mb-4 bg-gray-50 rounded-lg p-2.5 sm:p-3 border border-gray-200">
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-900 mb-1.5 sm:mb-2">Manage Attendees</h3>
                    <div className="flex flex-wrap gap-2 sm:gap-3 text-xs text-gray-600">
                      <span className="flex items-center gap-1 sm:gap-1.5">
                        <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-green-500 rounded-full" />
                        <span className="font-medium">{realTimeAttendingCount} Going</span>
                      </span>
                      <span className="flex items-center gap-1 sm:gap-1.5">
                        <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-red-500 rounded-full" />
                        <span className="font-medium">{counts.notGoingCount} Not Going</span>
                      </span>
                      <span className="flex items-center gap-1 sm:gap-1.5">
                        <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-purple-500 rounded-full" />
                        <span className="font-medium">{waitlistCount} Waitlisted</span>
                      </span>
                    </div>
                  </div>

                  {/* Add Attendees Section - Show based on event settings */}
                  <div className="bg-orange-50 border border-orange-200 rounded-lg mb-3 sm:mb-4">
                    <motion.button
                      id="add-attendees-trigger"
                      aria-expanded={!isAddSectionCollapsed}
                      aria-controls="add-attendees-panel"
                      onClick={() => canAddAttendees && setIsAddSectionCollapsed((v) => !v)}
                      disabled={!canAddAttendees}
                      className={`w-full p-3 sm:p-4 flex items-center justify-between touch-manipulation ${canAddAttendees ? 'active:bg-orange-100 cursor-pointer' : 'opacity-50 cursor-not-allowed'
                        }`}
                      aria-label={`${isAddSectionCollapsed ? 'Expand' : 'Collapse'} Add Attendees section`}
                      title={!canAddAttendees ? 'Only organizers can add non-members for this event. Contact the organizer for details.' : undefined}
                    >
                      <div className="flex items-center gap-2 sm:gap-3 flex-1">
                        <div className={`p-1.5 sm:p-2 bg-white rounded-lg shadow-sm ${!canAddAttendees ? 'opacity-60' : ''}`}>
                          <UserPlus className="w-4 h-4 sm:w-5 sm:h-5 text-[#F25129]" />
                        </div>
                        <div className="text-left flex-1">
                          <h4 className={`font-semibold text-xs sm:text-sm ${!canAddAttendees ? 'text-gray-600' : 'text-gray-900'}`}>
                            Add Attendees {!canAddAttendees && <span className="text-xs text-gray-500 font-normal">(Admin Only)</span>}
                          </h4>
                          {canAddAttendees && readyToAddCount > 0 && (
                            <span className="text-xs text-orange-600 font-medium">
                              {readyToAddCount} ready to add
                            </span>
                          )}
                          {!canAddAttendees && (
                            <span className="text-xs text-gray-500 font-normal block mt-0.5">
                              Only organizers can add non-members for this event
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">

                        {canAddAttendees && (
                          <motion.div animate={{ rotate: isAddSectionCollapsed ? 0 : 180 }} transition={{ duration: 0.3 }}>
                            <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-[#F25129]" />
                          </motion.div>
                        )}
                      </div>
                    </motion.button>

                    {!isAddSectionCollapsed && canAddAttendees && (
                      <div className="px-4 pt-2">
                        {!canAddAttendees && (
                          <div className="mb-2 sm:mb-3 p-2.5 sm:p-3 rounded-lg text-xs sm:text-sm bg-gray-50 border border-gray-200">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
                              <span className="font-medium text-gray-700">Adding attendees is restricted</span>
                            </div>
                            <p className="mt-1 text-xs text-gray-600">
                              Only organizers can add non-members for this event. Contact the organizer for details.
                            </p>
                          </div>
                        )}
                        {canAddAttendees && capacityState.isNearlyFull && (
                          <div className={`mb-2 sm:mb-3 p-2.5 sm:p-3 rounded-lg text-xs sm:text-sm ${getCapacityBadgeClasses(capacityState.state)}`}>
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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
                      {!isAddSectionCollapsed && canAddAttendees && (
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
                          {isGuestTrulyPublic ? (
                            <div className="p-4 pt-2 space-y-3">
                              {guestMemberExists ? (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                                  <p className="text-sm text-amber-700 font-medium">You are already a member. Please login to RSVP.</p>
                                  <button type="button" onClick={() => navigate('/login')} className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">Go to Login</button>
                                </div>
                              ) : (
                                <>
                                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                                    <p className="text-xs font-semibold text-blue-800">Simple 3-Step RSVP</p>
                                    <p className="mt-1 text-xs text-blue-700">Verify phone with OTP, add attendees if needed, then submit RSVP.</p>
                                  </div>
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                    <div className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold ${guestContactReady ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>1. Contact details</div>
                                    <div className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold ${isPhoneVerified ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>2. OTP verified</div>
                                    <div className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold ${guestSubmitted ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>3. RSVP submitted</div>
                                  </div>
                                  {/* Step 1: Contact Information */}
                                  <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
                                    <h4 className="text-sm font-semibold text-gray-900">Step 1: Your details</h4>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">First Name *</label>
                                        <input
                                          value={guestFirstName}
                                          onChange={(e) => setGuestFirstName(e.target.value)}
                                          placeholder="First name"
                                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                          disabled={isPhoneVerified}
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Last Name *</label>
                                        <input
                                          value={guestLastName}
                                          onChange={(e) => setGuestLastName(e.target.value)}
                                          placeholder="Last name"
                                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                          disabled={isPhoneVerified}
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
                                      <input
                                        type="email"
                                        value={guestEmail}
                                        onChange={(e) => setGuestEmail(e.target.value)}
                                        placeholder="Email address"
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                        disabled={isPhoneVerified}
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">Phone *</label>
                                      <div className="flex gap-2">
                                        <select
                                          value={guestCountryCode}
                                          onChange={(e) => setGuestCountryCode(e.target.value as '+1' | '+91')}
                                          disabled={isPhoneVerified}
                                          className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
                                        >
                                          <option value="+1">+1 (US)</option>
                                          <option value="+91">+91 (India)</option>
                                        </select>
                                        <input
                                          type="tel"
                                          value={guestPhone}
                                          onChange={(e) => setGuestPhone(e.target.value)}
                                          placeholder={guestCountryCode === '+91' ? '98765 43210' : '201 555 0123'}
                                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                          disabled={isPhoneVerified}
                                        />
                                      </div>
                                      <p className="mt-1 text-[11px] text-gray-500">Country code will be sent as {guestCountryCode}</p>
                                    </div>

                                    {/* Verify Phone Button - Only show if not verified */}
                                    {!isPhoneVerified && (
                                      <button
                                        type="button"
                                        onClick={handleVerifyPhone}
                                        disabled={!guestContactReady}
                                        className="w-full py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 transition-transform touch-manipulation"
                                      >
                                        Step 1: Verify Phone Number (OTP)
                                      </button>
                                    )}

                                    {/* Verification Success Message */}
                                    {isPhoneVerified && (
                                      <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                                        <div className="flex items-center gap-2">
                                          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                          <span className="text-sm text-green-700 font-medium">Phone verified. Continue with Step 2 or submit RSVP in Step 3.</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Step 2: Additional Members - Only show after phone verification */}
                                  {isPhoneVerified && showAdditionalMembersForm && (
                                    <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                                      <div className="mb-2 flex items-center justify-between">
                                        <h4 className="text-sm font-semibold text-gray-900">Step 2: Additional Attendees <span className="text-xs font-normal text-gray-500">(Optional)</span></h4>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          onClick={addGuestFamilyRow}
                                          className="rounded-md border border-[#F25129]/30 bg-[#FFF6F2] px-2.5 py-1.5 text-xs font-semibold text-[#C74221] hover:bg-[#FFEDE5]"
                                        >
                                          + Add Family Member
                                        </button>
                                        <button
                                          type="button"
                                          onClick={addGuestOnlyRow}
                                          className="rounded-md border border-[#FFC107]/40 bg-[#FFF9E6] px-2.5 py-1.5 text-xs font-semibold text-[#9A6A00] hover:bg-[#FFF2C2]"
                                        >
                                          + Add Guest
                                        </button>
                                      </div>
                                      <div className="text-[11px] text-gray-600">
                                        Added: {guestAdditionalCount} total ({guestFamilyCount} family, {guestOnlyCount} guest)
                                      </div>
                                      <div className="space-y-2">
                                        {guestRows.map((row) => (
                                          <div key={row.id} className="grid grid-cols-1 gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2 sm:grid-cols-12">
                                            <input
                                              value={row.name}
                                              onChange={(e) => setGuestRows((prev) => prev.map((r) => r.id === row.id ? { ...r, name: e.target.value } : r))}
                                              placeholder="Member name"
                                              className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-5"
                                            />
                                            <select
                                              value={row.ageGroup}
                                              onChange={(e) => setGuestRows((prev) => prev.map((r) => r.id === row.id ? { ...r, ageGroup: e.target.value as AgeGroup } : r))}
                                              className="rounded-lg border border-gray-300 px-2 py-2 text-sm sm:col-span-2"
                                            >
                                              <option value="0-2">Infant (0-2)</option>
                                              <option value="3-5">Toddler (3-5)</option>
                                              <option value="6-10">Child (6-10)</option>
                                              <option value="11+">Teen (11+)</option>
                                              <option value="adult">Adult</option>
                                            </select>
                                            <select
                                              value={row.relationship}
                                              onChange={(e) => setGuestRows((prev) => prev.map((r) => r.id === row.id ? { ...r, relationship: e.target.value as Relationship } : r))}
                                              className="rounded-lg border border-gray-300 px-2 py-2 text-sm sm:col-span-3"
                                            >
                                              <option value="guest">Guest</option>
                                              <option value="spouse">Spouse</option>
                                              <option value="child">Child</option>
                                            </select>
                                            <button
                                              type="button"
                                              onClick={() => setGuestRows((prev) => prev.length > 1 ? prev.filter((r) => r.id !== row.id) : prev)}
                                              className="px-2 py-2 text-xs text-gray-500 hover:text-red-500 border border-gray-200 rounded-lg sm:col-span-2"
                                            >
                                              Remove
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Step 3: Submit RSVP - Only enabled after phone verification */}
                                  {isPhoneVerified && (
                                    <div className="rounded-lg border border-[#F25129]/20 bg-[#FFF7F3] p-3">
                                      <p className="mb-2 text-xs font-semibold text-[#C74221]">Step 3: Final confirmation</p>
                                      <button
                                        type="button"
                                        onClick={handleSubmitGuestRsvp}
                                        disabled={guestSubmitting}
                                        className="w-full py-2.5 text-sm font-bold bg-gradient-to-r from-[#F25129] to-[#E0451F] text-white rounded-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-transform touch-manipulation"
                                      >
                                        {guestSubmitting ? 'Submitting...' : `Submit RSVP for ${1 + guestAdditionalCount} attendee(s)`}
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="p-4 pt-2 space-y-3">
                              {/* Mobile-Friendly Attendee Input - No table layout */}
                              {bulkFormData.familyMembers.map((member) => (
                                <div
                                  key={member.id}
                                  className="bg-white rounded-lg p-3 border border-gray-200"
                                >
                                  <AttendeeInputRowMemo
                                    member={member}
                                    onUpdate={updateBulkFormField}
                                    onRemove={removeBulkFormRow}
                                    onAdd={addBulkFormRow}
                                  />
                                </div>
                              ))}

                              <div className="pt-2.5 sm:pt-3 border-t border-orange-200">
                                <button
                                  onClick={handleBulkAddFamilyMembers}
                                  disabled={
                                    isAdding ||
                                    bulkFormData.familyMembers.every((m) => !m.name.trim()) ||
                                    (!capacityState.canAddMore && !capacityState.canWaitlist)
                                  }
                                  className="w-full px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm font-bold bg-gradient-to-r from-[#F25129] to-[#E0451F] text-white rounded-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-transform touch-manipulation"
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
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <AttendeeList
                      eventId={event.id}
                      event={event}
                      isAdmin={isAdmin}
                      waitlistPositions={waitlistPositions}
                      capacityState={capacityState}
                      onAttendeeUpdate={async () => {
                        try { await refreshAttendees(); } catch { }
                      }}
                      onCascadingStatusUpdate={handleCascadingStatusUpdate}
                      onRequestNonRefundableModal={(attendeeId, status) => {
                        setPendingStatusChange({ attendeeId, status });
                        setShowNonRefundableModal(true);
                      }}
                    />
                  </div>

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

            <div className="mt-6 px-4 pb-6">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h4 className="mb-1 text-base font-semibold text-gray-900">Event Comments</h4>
                <p className="mb-4 text-sm text-gray-600">
                  Share updates or questions with members for this event.
                </p>
                <CommentSection
                  collectionPath={`events/${event.id}/comments`}
                  initialOpen={true}
                  pageSize={20}
                />
              </div>
            </div>
          </div>

        </div>
      </div>
      {/* Non-Refundable Confirmation Modal */}
      {showNonRefundableModal && (
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
            <button
              onClick={() => setShowNonRefundableModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>

            <h3 className="text-xl font-bold text-gray-900 text-center mb-4">
              Non-Refundable Event
            </h3>

            <p className="text-gray-700 text-center mb-6 leading-relaxed">
              This event is non-refundable.<br />
              Are you sure you want to change your RSVP to Not Going?
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowNonRefundableModal(false)}
                className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowNonRefundableModal(false);
                  if (pendingStatusChange) {
                    await handleCascadingStatusUpdate(pendingStatusChange.attendeeId, pendingStatusChange.status);
                    setPendingStatusChange(null);
                  }
                }}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl"
              >
                Yes
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* OTP Verification Modal for Guest Payments */}
      {showOTPModal && isGuestTrulyPublic && (
        <OTPVerificationModal
          isOpen={showOTPModal}
          onClose={() => setShowOTPModal(false)}
          onVerified={handleOTPVerified}
          phone={normalizeGuestPhoneToE164OrNull(guestPhone) || `${guestCountryCode}${guestPhone.replace(/\D/g, '')}`}
          email={guestEmail}
          firstName={guestFirstName}
          lastName={guestLastName}
          eventId={event?.id || ''}
        />
      )}
    </>
  );
};

export default RSVPPage;
