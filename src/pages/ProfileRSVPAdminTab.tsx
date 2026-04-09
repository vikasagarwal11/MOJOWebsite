import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Calendar, Eye, EyeOff } from 'lucide-react';
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import EventCardNew from '../components/events/EventCardNew';
import { auth, db } from '../config/firebase';
import { EventDoc } from '../hooks/useEvents';
import { PaymentService } from '../services/paymentService';

type ProfileRSVPAdminTabProps = {
  rsvpsByEvent: { [eventId: string]: any[] };
  allEvents: EventDoc[];
  userNames: { [userId: string]: string };
  updateRsvp: (eventId: string, attendeeId: string, status: 'going' | 'not-going' | 'waitlisted' | null) => Promise<void>;
  exportRsvps: (event: EventDoc) => Promise<void>;
  exportingRsvps: string | null;
  adjustAttendingCount: (eventId: string, increment: boolean) => Promise<void>;
  adjustWaitlistCount: (eventId: string, increment: boolean) => Promise<void>;
  blockUserFromRsvp: (userId: string) => Promise<void>;
  analyzeLastMinuteChanges: (rsvp: any, eventStart: any) => number;
  rsvpFilter: 'all' | 'going' | 'not-going';
  setRsvpFilter: (value: 'all' | 'going' | 'not-going') => void;
  eventsPage: number;
  setEventsPage: (value: number) => void;
  PAGE_SIZE: number;
  loadingAdminEvents: boolean;
  currentUser: any;
  toggleReadOnlyStatus: (eventId: string) => Promise<void>;
};

export const ProfileRSVPAdminTab: React.FC<ProfileRSVPAdminTabProps> = ({
  rsvpsByEvent,
  allEvents,
  userNames,
  updateRsvp,
  exportRsvps,
  exportingRsvps,
  adjustAttendingCount,
  adjustWaitlistCount,
  blockUserFromRsvp,
  analyzeLastMinuteChanges,
  // rsvpFilter, // Unused - using per-event filters instead
  setRsvpFilter,
  eventsPage,
  setEventsPage,
  PAGE_SIZE,
  loadingAdminEvents,
  // currentUser, // Unused in this component
  toggleReadOnlyStatus,
}) => {
  // NEW: Event filtering state
  const [eventFilter, setEventFilter] = React.useState('');
  const [filteredEvents, setFilteredEvents] = React.useState<EventDoc[]>(allEvents);
  
  // NEW: User details state for email/phone show/hide
  const [userDetails, setUserDetails] = useState<{[userId: string]: {email?: string; phone?: string}}>({});
  const [showContactInfo, setShowContactInfo] = useState<{[userId: string]: boolean}>({});
  
  // NEW: Two-level display state (for future implementation)
  // const [expandedUsers, setExpandedUsers] = useState<{[userId: string]: boolean}>({});
  // const [showAuditTrail, setShowAuditTrail] = useState(false);
  
  // NEW: Per-event RSVP filter state (instead of global)
  const [eventRsvpFilters, setEventRsvpFilters] = useState<{[eventId: string]: 'all' | 'going' | 'not-going' | 'waitlisted'}>({});
  
  // NEW: Date and Activity filter state - Default to 'upcoming' as requested
  const [dateFilter, setDateFilter] = useState<'all' | 'upcoming' | 'this-week' | 'past'>('upcoming');
  const [activityFilter, setActivityFilter] = useState<'all' | 'has-rsvps' | 'no-rsvps' | 'high-activity'>('all');
  
  // NEW: Advanced search state
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [locationFilter, setLocationFilter] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<{
    startDate: string;
    endDate: string;
    enabled: boolean;
  }>({
    startDate: '',
    endDate: '',
    enabled: false
  });
  const [creatorFilter, setCreatorFilter] = useState('');
  const [maxAttendeesFilter, setMaxAttendeesFilter] = useState<{
    min: string;
    max: string;
    enabled: boolean;
  }>({
    min: '',
    max: '',
    enabled: false
  });
  
  // NEW: Sorting state - Add sort direction for date sorting
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'location' | 'rsvp-count'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Function to fetch user email and phone details
  const fetchUserDetails = async (userId: string) => {
    console.log('🔍 fetchUserDetails called for userId:', userId);
    if (userDetails[userId]) {
      console.log('🔍 User details already cached for:', userId);
      return; // Already fetched
    }
    
    try {
      console.log('🔍 Fetching user document for userId:', userId);
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        console.log('🔍 User data found:', { email: userData.email, phoneNumber: userData.phoneNumber });
        
        // Try to get phone number from Firebase Auth as fallback
        let phoneNumber = userData.phoneNumber;
        if (!phoneNumber && auth.currentUser?.uid === userId) {
          phoneNumber = auth.currentUser.phoneNumber || undefined;
          console.log('🔍 Using Firebase Auth phone number as fallback:', phoneNumber);
        }
        
        setUserDetails(prev => ({
          ...prev,
          [userId]: {
            email: userData.email || 'Not provided',
            phone: phoneNumber || 'Not provided'
          }
        }));
      } else {
        console.log('🔍 User document does not exist for userId:', userId);
      }
    } catch (error) {
      console.error('🚨 Error fetching user details:', error);
      setUserDetails(prev => ({
        ...prev,
        [userId]: {
          email: 'Error loading',
          phone: 'Error loading'
        }
      }));
    }
  };
  
  // Function to toggle contact info visibility
  const toggleContactInfo = async (userId: string) => {
    console.log('🔍 toggleContactInfo called for userId:', userId);
    console.log('🔍 Current showContactInfo state:', showContactInfo[userId]);
    if (!showContactInfo[userId]) {
      console.log('🔍 Contact info not shown, fetching user details...');
      await fetchUserDetails(userId);
    }
    setShowContactInfo(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
    console.log('🔍 Toggled showContactInfo for userId:', userId);
  };
  
  // Function to update per-event RSVP filter
  const updateEventRsvpFilter = (eventId: string, filter: 'all' | 'going' | 'not-going' | 'waitlisted') => {
    setEventRsvpFilters(prev => ({
      ...prev,
      [eventId]: filter
    }));
  };

  const isGuestNonLoggedIn = (rsvp: any) => {
    const userId = String(rsvp?.userId || '');
    return Boolean(rsvp?.isGuest || userId.startsWith('guest_'));
  };

  const getGuestLabel = (rsvp: any) => {
    return isGuestNonLoggedIn(rsvp) ? 'Guest (Non-Logged-In)' : null;
  };

  // Helper function to organize attendees by primary user
  const organizeAttendeesByUser = (attendees: any[]) => {
    const userGroups: {[userId: string]: any[]} = {};
    attendees.forEach(attendee => {
      const userId = attendee.userId;
      if (!userGroups[userId]) {
        userGroups[userId] = [];
      }
      userGroups[userId].push(attendee);
    });
    return userGroups;
  };

  // Helper function to calculate billing summary
  const calculateBillingSummary = (attendees: any[]) => {
    // Helper to get status - check both 'status' and 'rsvpStatus' fields for compatibility
    const getStatus = (attendee: any): string => {
      return attendee.status || attendee.rsvpStatus || 'unknown';
    };
    
    const summary = {
      total: attendees.length,
      going: attendees.filter(a => getStatus(a) === 'going').length,
      notGoing: attendees.filter(a => getStatus(a) === 'not-going').length,
      waitlisted: attendees.filter(a => getStatus(a) === 'waitlisted').length,
      byAgeGroup: {
        adults: 0,
        children0to2: 0,
        children3to5: 0,
        children6to10: 0,
        children11plus: 0
      },
      byType: {
        primary: 0,
        family: 0,
        guests: 0
      }
    };
    
    // Debug logging in development mode
    if (import.meta.env.DEV && attendees.length > 0) {
      const statusBreakdown = attendees.reduce((acc: any, a: any) => {
        const status = getStatus(a);
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      
      console.log('🔍 ProfileRSVPAdminTab - calculateBillingSummary:', {
        totalAttendees: attendees.length,
        statusBreakdown,
        calculatedSummary: {
          going: summary.going,
          notGoing: summary.notGoing,
          waitlisted: summary.waitlisted
        },
        sampleAttendee: {
          id: attendees[0]?.id,
          name: attendees[0]?.name,
          status: attendees[0]?.status,
          rsvpStatus: attendees[0]?.rsvpStatus,
          finalStatus: getStatus(attendees[0])
        }
      });
    }

    attendees.forEach(attendee => {
      // Count by age group
      switch (attendee.ageGroup) {
        case '0-2':
          summary.byAgeGroup.children0to2++;
          break;
        case '3-5':
          summary.byAgeGroup.children3to5++;
          break;
        case '6-10':
          summary.byAgeGroup.children6to10++;
          break;
        case '11+':
          summary.byAgeGroup.children11plus++;
          break;
        case 'adult':
        default:
          summary.byAgeGroup.adults++;
          break;
      }

      // Count by type
      switch (attendee.attendeeType) {
        case 'primary':
          summary.byType.primary++;
          break;
        case 'family_member':
          summary.byType.family++;
          break;
        case 'guest':
          summary.byType.guests++;
          break;
      }
    });

    return summary;
  };

  // Helper function to toggle user expansion (for future implementation)
  // const toggleUserExpansion = (userId: string) => {
  //   setExpandedUsers(prev => ({
  //     ...prev,
  //     [userId]: !prev[userId]
  //   }));
  // };
  
  // Function to get current filter for a specific event
  const getEventRsvpFilter = (eventId: string) => {
    return eventRsvpFilters[eventId] || 'all';
  };
  
  // NEW: Helper functions for date filtering
  const isEventUpcoming = (event: Event) => {
    if (!event.startAt) return false;
    const eventDate = event.startAt.toDate ? event.startAt.toDate() : new Date(event.startAt);
    return eventDate > new Date();
  };
  
  const isEventThisWeek = (event: Event) => {
    if (!event.startAt) return false;
    const eventDate = event.startAt.toDate ? event.startAt.toDate() : new Date(event.startAt);
    const now = new Date();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000);
    return eventDate >= startOfWeek && eventDate <= endOfWeek;
  };
  
  const isEventPast = (event: Event) => {
    if (!event.startAt) return false;
    const eventDate = event.startAt.toDate ? event.startAt.toDate() : new Date(event.startAt);
    return eventDate < new Date();
  };
  
  // NEW: Helper functions for advanced filtering
  const isEventInDateRange = (event: Event) => {
    if (!dateRangeFilter.enabled || !event.startAt) return true;
    
    const eventDate = event.startAt.toDate ? event.startAt.toDate() : new Date(event.startAt);
    const startDate = dateRangeFilter.startDate ? new Date(dateRangeFilter.startDate) : null;
    const endDate = dateRangeFilter.endDate ? new Date(dateRangeFilter.endDate) : null;
    
    if (startDate && eventDate < startDate) return false;
    if (endDate && eventDate > endDate) return false;
    
    return true;
  };
  
  const isEventInLocation = (event: Event) => {
    if (!locationFilter.trim()) return true;
    return event.location.toLowerCase().includes(locationFilter.toLowerCase());
  };
  
  const isEventByCreator = (event: Event) => {
    if (!creatorFilter.trim()) return true;
    return event.createdBy.toLowerCase().includes(creatorFilter.toLowerCase());
  };
  
  const isEventInAttendeeRange = (event: Event) => {
    if (!maxAttendeesFilter.enabled || !event.maxAttendees) return true;
    
    const min = parseInt(maxAttendeesFilter.min) || 0;
    const max = parseInt(maxAttendeesFilter.max) || Infinity;
    
    return event.maxAttendees >= min && event.maxAttendees <= max;
  };

  // NEW: Filter events based on search input, date, activity, and advanced filters
  React.useEffect(() => {
    let filtered = allEvents;
    
    // Apply text search filter
    if (eventFilter.trim()) {
      filtered = filtered.filter(event => 
        event.title.toLowerCase().includes(eventFilter.toLowerCase()) ||
        event.description.toLowerCase().includes(eventFilter.toLowerCase()) ||
        event.location.toLowerCase().includes(eventFilter.toLowerCase())
      );
    }
    
    // Apply date filter
    if (dateFilter !== 'all') {
      filtered = filtered.filter(event => {
        switch (dateFilter) {
          case 'upcoming':
            return isEventUpcoming(event);
          case 'this-week':
            return isEventThisWeek(event);
          case 'past':
            return isEventPast(event);
          default:
            return true;
        }
      });
    }
    
    // Apply activity filter
    if (activityFilter !== 'all') {
      filtered = filtered.filter(event => {
        const rsvpCount = rsvpsByEvent[event.id]?.length || 0;
        switch (activityFilter) {
          case 'has-rsvps':
            return rsvpCount > 0;
          case 'no-rsvps':
            return rsvpCount === 0;
          case 'high-activity':
            return rsvpCount >= 5;
          default:
            return true;
        }
      });
    }
    
    // NEW: Apply advanced filters
    filtered = filtered.filter(event => 
      isEventInDateRange(event) &&
      isEventInLocation(event) &&
      isEventByCreator(event) &&
      isEventInAttendeeRange(event)
    );
    
    // NEW: Apply sorting with direction support
    filtered.sort((a, b) => {
      let result = 0;
      switch (sortBy) {
        case 'date':
          if (!a.startAt || !b.startAt) return 0;
          const dateA = a.startAt.toDate ? a.startAt.toDate() : new Date(a.startAt);
          const dateB = b.startAt.toDate ? b.startAt.toDate() : new Date(b.startAt);
          result = dateA.getTime() - dateB.getTime();
          break;
        case 'title':
          result = a.title.localeCompare(b.title);
          break;
        case 'location':
          result = a.location.localeCompare(b.location);
          break;
        case 'rsvp-count':
          const countA = rsvpsByEvent[a.id]?.length || 0;
          const countB = rsvpsByEvent[b.id]?.length || 0;
          result = countB - countA; // High to low by default
          break;
        default:
          return 0;
      }
      // Apply sort direction (only for date, title, and location - rsvp-count is always desc)
      if (sortBy === 'date' || sortBy === 'title' || sortBy === 'location') {
        return sortDirection === 'asc' ? result : -result;
      }
      return result;
    });
    
    setFilteredEvents(filtered);
  }, [eventFilter, dateFilter, activityFilter, locationFilter, dateRangeFilter, creatorFilter, maxAttendeesFilter, sortBy, sortDirection, allEvents, rsvpsByEvent]);

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-700">RSVP Management & Analytics</h2>
        <button
        onClick={() => {
          setRsvpFilter('all');        // Reset RSVP status filter
          setEventFilter('');          // Reset event search filter
          setEventRsvpFilters({});     // Reset all per-event RSVP filters
          setDateFilter('upcoming');   // Reset date filter to upcoming (default)
          setActivityFilter('all');    // Reset activity filter
          setLocationFilter('');       // Reset location filter
          setDateRangeFilter({ startDate: '', endDate: '', enabled: false }); // Reset date range
          setCreatorFilter('');        // Reset creator filter
          setMaxAttendeesFilter({ min: '', max: '', enabled: false }); // Reset attendee range
          setShowAdvancedSearch(false); // Hide advanced search
          setSortBy('date');           // Reset sorting to date
          setSortDirection('asc');     // Reset sort direction to ascending
        }}
        className="ml-4 text-xs text-[#F25129] hover:underline"
        aria-label="Reset all filters"
      >
        Reset All Filters
      </button>
    </div>
    {/* RSVP Analytics Dashboard */}
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📊</span>
          <div>
            <div className="text-sm text-green-600 font-medium">Total RSVPs</div>
            <div className="text-2xl font-bold text-green-800">
              {Object.values(rsvpsByEvent).reduce((sum, rsvps) => sum + rsvps.length, 0)}
            </div>
          </div>
        </div>
      </div>
      <div className="p-4 bg-gradient-to-br from-[#F25129]/10 to-[#FFC107]/10 rounded-lg border border-[#F25129]/20">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✅</span>
          <div>
            <div className="text-sm text-[#F25129] font-medium">Going</div>
            <div className="text-2xl font-bold text-[#F25129]">
              {Object.values(rsvpsByEvent).reduce((sum, rsvps) => sum + rsvps.filter(r => (r.status || r.rsvpStatus) === 'going').length, 0)}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 bg-gradient-to-br from-red-50 to-red-100 rounded-lg border border-red-200">
        <div className="flex items-center gap-2">
          <span className="text-2xl">❌</span>
          <div>
            <div className="text-sm text-red-600 font-medium">Not Going</div>
            <div className="text-2xl font-bold text-red-800">
              {Object.values(rsvpsByEvent).reduce((sum, rsvps) => sum + rsvps.filter(r => (r.status || r.rsvpStatus) === 'not-going').length, 0)}
            </div>
          </div>
        </div>
      </div>
    </div>
    {/* Last-Minute Changes Alert */}
    {(() => {
      const lastMinuteChanges = Object.values(rsvpsByEvent).flat().filter(rsvp => {
        const event = allEvents.find(e => e.id === rsvp.eventId);
        if (!event || !event.startAt) return false;
        return analyzeLastMinuteChanges(rsvp, event.startAt) > 0;
      });
      if (lastMinuteChanges.length > 0) {
        return (
          <div className="p-4 bg-gradient-to-r from-orange-50 to-red-50 rounded-lg border border-orange-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">⚠️</span>
              <h3 className="font-semibold text-orange-800">Last-Minute Changes Alert</h3>
            </div>
            <p className="text-sm text-orange-700 mb-3">
              {lastMinuteChanges.length} user(s) changed their RSVP to "Not Going" within 24 hours of event start
            </p>
            <div className="space-y-2">
              {lastMinuteChanges.slice(0, 3).map(rsvp => {
                const event = allEvents.find(e => e.id === rsvp.eventId);
                const userName = userNames[rsvp.userId] || 'Unknown User';
                return (
                  <div key={rsvp.id} className="text-xs text-orange-600 bg-white p-2 rounded border">
                    <strong>{userName}</strong> changed RSVP for <strong>{event?.title}</strong> to "Not Going"
                  </div>
                );
              })}
              {lastMinuteChanges.length > 3 && (
                <div className="text-xs text-orange-600">
                  ...and {lastMinuteChanges.length - 3} more changes
                </div>
              )}
            </div>
          </div>
        );
      }
      return null;
    })()}
    {/* COMMENTED OUT: Duplicate User Management Section - Moved to Admin Tab Only */}
    {/* 
    {currentUser?.role === 'admin' && (
      <div className="p-6 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          🚫 User Management
          <span className="text-sm font-normal text-gray-600">(Admin Only)</span>
        </h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-700 mb-3">Blocked Users</h4>
            <div className="space-y-2">
              {Object.entries(userNames).map(([userId, userName]) => (
                <div key={userId} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div>
                    <div className="font-medium text-sm">{userName}</div>
                    <div className="text-xs text-gray-500">{userId.slice(0, 8)}...</div>
                  </div>
                  <button
                    onClick={() => blockUserFromRsvp(userId)}
                    className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                    title="Block user from RSVPing"
                  >
                    Block
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 mb-3">RSVP Status History</h4>
            <p className="text-sm text-gray-600 mb-3">
              Track all RSVP changes with timestamps and user details
            </p>
            <div className="text-xs text-gray-500">
              • Status changes are logged automatically<br />
              • Last-minute cancellations are highlighted<br />
              • Full audit trail for compliance
            </div>
          </div>
        </div>
      </div>
    )}
    */}
    
    {/* COMMENTED OUT: Development note removed as requested */}
    {/* 
    
    <div className="p-4 bg-[#FFC107]/10 border border-[#FFC107]/20 rounded-lg">
      <div className="flex items-center gap-2 text-[#FFC107]">
        <span className="text-lg">💡</span>
        <div className="text-sm">
          <strong>Note:</strong> User blocking and management is now handled exclusively in the <strong>Admin</strong> tab.
          <br />
          This tab focuses purely on RSVP management and analytics.
        </div>
      </div>
    </div>
    */}
    
        {/* NEW: Event Filtering Section */}
    <div className="rounded-xl border border-[#F25129]/20 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Event Filtering</h3>
          <p className="text-xs text-gray-500">Filter events, attendance activity, and RSVP signal quickly.</p>
        </div>
        <span className="rounded-md bg-[#F25129]/10 px-2.5 py-1 text-xs font-semibold text-[#C74221]">
          {filteredEvents.length} of {allEvents.length} events
        </span>
      </div>

      <div className="mb-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Sort</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[#F25129]">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => {
              const newSortBy = e.target.value as 'date' | 'title' | 'location' | 'rsvp-count';
              setSortBy(newSortBy);
              if (newSortBy !== 'rsvp-count') {
                setSortDirection('asc');
              }
            }}
            className="rounded-lg border border-[#F25129]/20 px-3 py-2 text-xs font-medium focus:ring-1 focus:ring-[#F25129]"
          >
            <option value="date">Date</option>
            <option value="title">Title</option>
            <option value="location">Location</option>
            <option value="rsvp-count">RSVP Count</option>
          </select>
          {(sortBy === 'date' || sortBy === 'title' || sortBy === 'location') && (
            <select
              value={sortDirection}
              onChange={(e) => setSortDirection(e.target.value as 'asc' | 'desc')}
              className="rounded-lg border border-[#F25129]/20 px-3 py-2 text-xs font-medium focus:ring-1 focus:ring-[#F25129]"
              title={`Sort ${sortBy} in ${sortDirection === 'asc' ? 'ascending' : 'descending'} order`}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          )}
        </div>
      </div>

      <div className="mb-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Date Window</div>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'all', label: 'All Events' },
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'this-week', label: 'This Week' },
            { value: 'past', label: 'Past' }
          ].map(filter => (
            <button
              key={filter.value}
              onClick={() => setDateFilter(filter.value as 'all' | 'upcoming' | 'this-week' | 'past')}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
                dateFilter === filter.value
                  ? 'border-[#F25129]/35 bg-[#F25129]/10 text-[#F25129] ring-2 ring-[#F25129]/20'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-[#FFF4EF]'
              }`}
              title={`Filter by ${filter.label}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">RSVP Activity</div>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'all', label: 'All Activity', count: Object.values(rsvpsByEvent).reduce((sum, rsvps) => sum + rsvps.length, 0) },
            { value: 'has-rsvps', label: 'Has RSVPs', count: allEvents.filter(e => rsvpsByEvent[e.id]?.length > 0).length },
            { value: 'no-rsvps', label: 'No RSVPs', count: allEvents.filter(e => !rsvpsByEvent[e.id]?.length).length },
            { value: 'high-activity', label: 'High Activity', count: allEvents.filter(e => (rsvpsByEvent[e.id]?.length || 0) >= 5).length }
          ].map(filter => (
            <button
              key={filter.value}
              onClick={() => setActivityFilter(filter.value as 'all' | 'has-rsvps' | 'no-rsvps' | 'high-activity')}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
                activityFilter === filter.value
                  ? 'border-[#FFC107]/30 bg-[#FFF8DE] text-[#A87000] ring-2 ring-[#FFC107]/20'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-[#FFFDF1]'
              }`}
              title={`${filter.label}: ${filter.count} events`}
            >
              {filter.label} ({filter.count})
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-all ${
              showAdvancedSearch
                ? 'border-[#F25129]/35 bg-[#F25129]/10 text-[#F25129] ring-2 ring-[#F25129]/20'
                : 'border-gray-200 bg-white text-[#F25129] hover:bg-[#FFF5F0]'
            }`}
            title={showAdvancedSearch ? 'Hide Advanced Search' : 'Show Advanced Search'}
            aria-label={showAdvancedSearch ? 'Hide Advanced Search' : 'Show Advanced Search'}
          >
            Filters
          </button>
          <span className="text-xs text-[#C74221]">
            {showAdvancedSearch ? 'Advanced filters active' : 'Click Advanced to expand'}
          </span>
        </div>
      </div>

      {showAdvancedSearch && (
        <div className="mb-3 rounded-lg border border-gray-200 p-3">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Location Filter</label>
              <input
                type="text"
                placeholder="Filter by location..."
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#F25129]"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Creator Filter</label>
              <input
                type="text"
                placeholder="Filter by creator..."
                value={creatorFilter}
                onChange={(e) => setCreatorFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#F25129]"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Date Range Filter</label>
              <div className="mb-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dateRangeFilter.enabled}
                  onChange={(e) => setDateRangeFilter(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="rounded border-gray-300 text-[#F25129] focus:ring-[#F25129]"
                />
                <span className="text-sm text-gray-600">Enable date range</span>
              </div>
              {dateRangeFilter.enabled && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={dateRangeFilter.startDate}
                    onChange={(e) => setDateRangeFilter(prev => ({ ...prev, startDate: e.target.value }))}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#F25129]"
                  />
                  <input
                    type="date"
                    value={dateRangeFilter.endDate}
                    onChange={(e) => setDateRangeFilter(prev => ({ ...prev, endDate: e.target.value }))}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#F25129]"
                  />
                </div>
              )}
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Max Attendees Filter</label>
              <div className="mb-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={maxAttendeesFilter.enabled}
                  onChange={(e) => setMaxAttendeesFilter(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="rounded border-gray-300 text-[#F25129] focus:ring-[#F25129]"
                />
                <span className="text-sm text-gray-600">Enable attendee range</span>
              </div>
              {maxAttendeesFilter.enabled && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={maxAttendeesFilter.min}
                    onChange={(e) => setMaxAttendeesFilter(prev => ({ ...prev, min: e.target.value }))}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#F25129]"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={maxAttendeesFilter.max}
                    onChange={(e) => setMaxAttendeesFilter(prev => ({ ...prev, max: e.target.value }))}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#F25129]"
                  />
                </div>
              )}
            </div>
          </div>

          {(locationFilter || creatorFilter || dateRangeFilter.enabled || maxAttendeesFilter.enabled) && (
            <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-medium text-green-700">Active Advanced Filters</span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {locationFilter && <span className="rounded-full bg-green-100 px-2 py-1 text-green-800">Location: {locationFilter}</span>}
                {creatorFilter && <span className="rounded-full bg-green-100 px-2 py-1 text-green-800">Creator: {creatorFilter}</span>}
                {dateRangeFilter.enabled && (
                  <span className="rounded-full bg-green-100 px-2 py-1 text-green-800">Date: {dateRangeFilter.startDate} to {dateRangeFilter.endDate}</span>
                )}
                {maxAttendeesFilter.enabled && (
                  <span className="rounded-full bg-green-100 px-2 py-1 text-green-800">Attendees: {maxAttendeesFilter.min || '0'} - {maxAttendeesFilter.max || 'No max'}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-2">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search events by title, description, or location..."
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="flex-1 rounded-xl border border-[#F25129]/30 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-transparent focus:ring-2 focus:ring-[#F25129]"
          />
          <button
            onClick={() => setEventFilter('')}
            className="rounded-xl bg-[#F25129] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E0451F]"
          >
            Clear Filter
          </button>
        </div>
      </div>
    </div>

    {/* Events with RSVP Management */}
    {loadingAdminEvents ? (
      <div className="text-center py-8 bg-gray-50 rounded-lg">
        <div className="animate-spin w-8 h-8 border-4 border-[#F25129] border-t-transparent rounded-full mx-auto mb-2"></div>
        <p className="text-gray-500">Loading admin events...</p>
      </div>
    ) : filteredEvents.length === 0 ? (
      <div className="text-center py-8 bg-gray-50 rounded-lg">
        <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-600">
          {eventFilter ? `No events match "${eventFilter}"` : 'No events found'}
        </p>
        <p className="text-xs text-gray-400">
          {eventFilter ? 'Try adjusting your search terms' : 'Create an event to start managing RSVPs'}
        </p>
      </div>
    ) : (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <h3 className="text-lg font-semibold text-gray-900">Event RSVP Details</h3>
          <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
            {filteredEvents.length} event{filteredEvents.length === 1 ? '' : 's'}
          </span>
        </div>
        {filteredEvents.map((event) => (
          <div 
            key={event.id} 
            className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            {/* EventCard for consistent display - WITH top action icons in RSVP tab */}
                                                   <EventCardNew
                event={event}
                onEdit={undefined} // RSVP tab doesn't need edit functionality
              />
            

            {/* RSVP Management Section */}
            <div className="border-t border-gray-200 pt-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-gray-700">RSVP Management</h4>
                  <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                    ({rsvpsByEvent[event.id]?.length || 0} total responses)
                  </span>
                </div>
                
                                 {/* Export CSV Button - Converted to Icon */}
                                   <button
                    onClick={() => exportRsvps(event)}
                    disabled={exportingRsvps === event.id}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      exportingRsvps === event.id
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700'
                    } text-white`}
                    title={exportingRsvps === event.id ? 'Exporting...' : 'Export RSVPs CSV'}
                    aria-label={`Export RSVPs for ${event.title}`}
                  >
                    {exportingRsvps === event.id ? (
                      <span className="text-sm">...</span>
                    ) : (
                      <span className="text-sm">CSV</span>
                    )}
                  </button>
              </div>
              
                             {/* ATTENDANCE MANAGEMENT - COMPACT & PROFESSIONAL */}
               <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <span className="text-sm text-gray-700">
                       Update attendance (<strong className="font-bold text-gray-900">{Math.max(0, event.attendingCount || 0)} checked in</strong>)
                     </span>
                   </div>
                   <div className="flex gap-2">
                     <button
                       onClick={() => adjustAttendingCount(event.id, true)}
                       className="p-1.5 bg-green-600 text-white rounded-full hover:bg-green-700 transition-colors"
                       title="Increase attendance count"
                       aria-label={`Increase attendance count for ${event.title}`}
                     >
                       <span className="text-sm">➕</span>
                     </button>
                     <button
                       onClick={() => adjustAttendingCount(event.id, false)}
                       disabled={Math.max(0, event.attendingCount || 0) <= 0}
                       className={`p-1.5 rounded-full transition-colors ${
                         Math.max(0, event.attendingCount || 0) <= 0
                           ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                           : 'bg-red-600 text-white hover:bg-red-700'
                       }`}
                       title={Math.max(0, event.attendingCount || 0) <= 0 ? 'Cannot decrease below 0' : 'Decrease attendance count'}
                       aria-label={`Decrease attendance count for ${event.title}`}
                     >
                       <span className="text-sm">➖</span>
                     </button>
                   </div>
                 </div>
                {/* Show warning for negative values */}
                {(event.attendingCount || 0) < 0 && (
                  <div className="mt-2 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                    ⚠️ Invalid data detected - attendance count cannot be negative
                  </div>
                )}
              </div>

              {/* WAITLIST COUNT MANAGEMENT */}
              {event.waitlistEnabled && (
                <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-700">
                        Update waitlist (<strong className="font-bold text-gray-900">{Math.max(0, event.waitlistCount || 0)} waiting</strong>)
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => adjustWaitlistCount(event.id, true)}
                        className="p-1.5 bg-yellow-600 text-white rounded-full hover:bg-yellow-700 transition-colors"
                        title="Increase waitlist count"
                        aria-label={`Increase waitlist count for ${event.title}`}
                      >
                        <span className="text-sm">➕</span>
                      </button>
                      <button
                        onClick={() => adjustWaitlistCount(event.id, false)}
                        disabled={Math.max(0, event.waitlistCount || 0) <= 0}
                        className={`p-1.5 rounded-full transition-colors ${
                          Math.max(0, event.waitlistCount || 0) <= 0
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                        title={Math.max(0, event.waitlistCount || 0) <= 0 ? 'Cannot decrease below 0' : 'Decrease waitlist count'}
                        aria-label={`Decrease waitlist count for ${event.title}`}
                      >
                        <span className="text-sm">➖</span>
                      </button>
                    </div>
                  </div>
                  {/* Show warning for negative values */}
                  {(event.waitlistCount || 0) < 0 && (
                    <div className="mt-2 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                      ⚠️ Invalid data detected - waitlist count cannot be negative
                    </div>
                  )}
                </div>
              )}

              {/* Read-Only Status Toggle */}
              <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-800">
                      📖 Read-Only Status: <strong className={event.isReadOnly ? 'text-blue-700' : 'text-gray-600'}>
                        {event.isReadOnly ? 'Read-Only Mode' : 'Interactive Mode'}
                      </strong>
                    </span>
                    {event.isReadOnly && (
                      <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                        No RSVP functionality
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => toggleReadOnlyStatus(event.id)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      event.isReadOnly
                        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    }`}
                    title={event.isReadOnly ? 'Set to Interactive Mode' : 'Set to Read-Only Mode'}
                  >
                    {event.isReadOnly ? 'Make Interactive' : 'Make Read-Only'}
                  </button>
                </div>
                <p className="text-xs text-blue-700 mt-1">
                  {event.isReadOnly 
                    ? 'This event is displayed without RSVP functionality on the read-only events page.'
                    : 'This event has full RSVP functionality and appears on the interactive events page.'
                  }
                </p>
              </div>
              
              {/* RSVP DATA SECTION - Only show when there are actual RSVPs */}
              {rsvpsByEvent[event.id]?.length ? (
                <>
                  {/* Enhanced RSVP Summary Dashboard with Billing Info */}
                  {(() => {
                    const attendees = rsvpsByEvent[event.id];
                    const billingSummary = calculateBillingSummary(attendees);
                    const primaryUserCount = Object.keys(organizeAttendeesByUser(attendees)).length;
                    
                    return (
                      <div className="mb-4 rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-gray-800">Comprehensive RSVP Summary</span>
                          {/* Audit Trail toggle will be implemented in future version */}
                        </div>
                        
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                            <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">
                              RSVP Status Summary
                            </div>
                            <table className="min-w-full text-xs">
                              <tbody>
                                <tr className="border-b border-gray-100">
                                  <td className="px-3 py-2 text-gray-600">Going</td>
                                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{billingSummary.going}</td>
                                </tr>
                                <tr className="border-b border-gray-100">
                                  <td className="px-3 py-2 text-gray-600">Not Going</td>
                                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{billingSummary.notGoing}</td>
                                </tr>
                                <tr className="border-b border-gray-100">
                                  <td className="px-3 py-2 text-gray-600">Total</td>
                                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{billingSummary.total}</td>
                                </tr>
                                <tr>
                                  <td className="px-3 py-2 text-gray-600">Users</td>
                                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{primaryUserCount}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                            <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">
                              Billing Breakdown
                            </div>
                            <table className="min-w-full text-xs">
                              <tbody>
                                <tr className="border-b border-gray-100"><td className="px-3 py-2 text-gray-600">Adults</td><td className="px-3 py-2 text-right font-semibold text-gray-900">{billingSummary.byAgeGroup.adults}</td></tr>
                                <tr className="border-b border-gray-100"><td className="px-3 py-2 text-gray-600">0-2 years</td><td className="px-3 py-2 text-right font-semibold text-gray-900">{billingSummary.byAgeGroup.children0to2}</td></tr>
                                <tr className="border-b border-gray-100"><td className="px-3 py-2 text-gray-600">3-5 years</td><td className="px-3 py-2 text-right font-semibold text-gray-900">{billingSummary.byAgeGroup.children3to5}</td></tr>
                                <tr className="border-b border-gray-100"><td className="px-3 py-2 text-gray-600">6-10 years</td><td className="px-3 py-2 text-right font-semibold text-gray-900">{billingSummary.byAgeGroup.children6to10}</td></tr>
                                <tr className="border-b border-gray-100"><td className="px-3 py-2 text-gray-600">11+ years</td><td className="px-3 py-2 text-right font-semibold text-gray-900">{billingSummary.byAgeGroup.children11plus}</td></tr>
                                <tr><td className="px-3 py-2 text-gray-600">Guests</td><td className="px-3 py-2 text-right font-semibold text-gray-900">{billingSummary.byType.guests}</td></tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  

                  
                  {/* Primary Users & Attendees Table */}
                  {(() => {
                    const attendees = rsvpsByEvent[event.id];
                    const currentFilter = getEventRsvpFilter(event.id);

                    return (
                      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
                        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-800">Primary Users & Their Attendees</span>
                            <select
                              value={currentFilter}
                              onChange={(e) => updateEventRsvpFilter(event.id, e.target.value as 'all' | 'going' | 'not-going' | 'waitlisted')}
                              className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:ring-2 focus:ring-[#F25129]"
                              aria-label={`Filter RSVPs for ${event.title}`}
                            >
                              <option value="all">All</option>
                              <option value="going">Going</option>
                              <option value="not-going">Not Going</option>
                              <option value="waitlisted">Waitlisted</option>
                            </select>
                          </div>

                          <div className="flex gap-2 flex-wrap">
                            {[ 
                              { value: 'all', label: 'All', count: attendees.length, color: 'bg-gray-100 text-gray-700' },
                              { value: 'going', label: 'Going', count: attendees.filter(r => (r.status || r.rsvpStatus) === 'going').length, color: 'bg-green-100 text-green-700' },
                              { value: 'not-going', label: 'Not Going', count: attendees.filter(r => (r.status || r.rsvpStatus) === 'not-going').length, color: 'bg-red-100 text-red-700' },
                              { value: 'waitlisted', label: 'Waitlisted', count: attendees.filter(r => (r.status || r.rsvpStatus) === 'waitlisted').length, color: 'bg-purple-100 text-purple-700' }
                            ].map(filter => (
                              <button
                                key={filter.value}
                                onClick={() => updateEventRsvpFilter(event.id, filter.value as 'all' | 'going' | 'not-going' | 'waitlisted')}
                                className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-200 ${
                                  currentFilter === filter.value
                                    ? filter.color + ' ring-2 ring-gray-400 ring-offset-2'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                                title={`${filter.label}: ${filter.count} responses`}
                              >
                                {filter.label} ({filter.count})
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="max-h-[460px] overflow-auto">
                          <table className="min-w-full text-xs">
                            <thead className="sticky top-0 z-10 bg-gray-100">
                              <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                                <th className="px-3 py-2">Name</th>
                                <th className="px-3 py-2">Type</th>
                                <th className="px-3 py-2">Contact</th>
                                <th className="px-3 py-2">Payment</th>
                                <th className="px-3 py-2">RSVP / Updated</th>
                                <th className="px-3 py-2">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rsvpsByEvent[event.id]
                                .filter(r => {
                                  const selected = getEventRsvpFilter(event.id);
                                  if (selected === 'all') return true;
                                  const rsvpStatus = r.status || r.rsvpStatus;
                                  return rsvpStatus === selected;
                                })
                                .map((rsvp) => (
                                  <tr key={rsvp.id} className="border-b border-gray-100 align-top hover:bg-[#FFF9F6]">
                                    <td className="px-3 py-2">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <div className="font-medium text-sm text-gray-900">{rsvp.name || rsvp.attendeeName || userNames[rsvp.userId] || 'Unknown'}</div>
                                        {getGuestLabel(rsvp) && (
                                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                                            {getGuestLabel(rsvp)}
                                          </span>
                                        )}
                                      </div>
                                      {rsvp.ageGroup && <div className="text-[11px] text-gray-500">{rsvp.ageGroup === '11+' ? '11+' : rsvp.ageGroup}</div>}
                                    </td>
                                    <td className="px-3 py-2 text-gray-700">
                                      <div>
                                        {rsvp.attendeeType === 'primary' ? 'Primary User' : rsvp.attendeeType === 'family_member' ? 'Family' : 'Guest'}
                                      </div>
                                      {isGuestNonLoggedIn(rsvp) && (
                                        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Non-Logged-In</div>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      <button
                                        onClick={() => toggleContactInfo(rsvp.userId)}
                                        className="rounded border border-[#FFC107]/30 bg-[#FFF7D9] px-2 py-1 font-medium text-[#A87000] hover:bg-[#FFEFB8]"
                                        title={showContactInfo[rsvp.userId] ? 'Hide contact info' : 'Show contact info'}
                                      >
                                        {showContactInfo[rsvp.userId] ? 'Hide Contact' : 'Show Contact'}
                                      </button>
                                      {showContactInfo[rsvp.userId] && userDetails[rsvp.userId] && (
                                        <div className="mt-2 space-y-1 text-[11px] text-gray-600">
                                          <div>{userDetails[rsvp.userId].email || rsvp.guestEmail || 'Not Available'}</div>
                                          <div>{userDetails[rsvp.userId].phone || rsvp.guestPhone || 'Not Available'}</div>
                                        </div>
                                      )}
                                      {showContactInfo[rsvp.userId] && !userDetails[rsvp.userId] && isGuestNonLoggedIn(rsvp) && (
                                        <div className="mt-2 space-y-1 text-[11px] text-gray-600">
                                          <div>{rsvp.guestEmail || 'Not Available'}</div>
                                          <div>{rsvp.guestPhone || 'Not Available'}</div>
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      {event.pricing && event.pricing.requiresPayment ? (
                                        <div className="space-y-2">
                                          <div className={`rounded border px-2 py-1 text-center font-bold ${rsvp.paymentStatus === 'paid' ? 'border-green-300 bg-green-100 text-green-700' : 'border-yellow-300 bg-yellow-100 text-yellow-700'}`}>
                                            {rsvp.paymentStatus === 'paid' ? 'Payment Successful' : 'Payment Pending'}
                                          </div>
                                          <button
                                            onClick={async () => {
                                              try {
                                                const newStatus = rsvp.paymentStatus === 'paid' ? 'unpaid' : 'paid';
                                                const adminUserId = auth.currentUser?.uid || 'unknown';
                                                if (event.pricing) {
                                                  await PaymentService.adminUpdatePaymentStatus(event.id, rsvp.id, newStatus, adminUserId, event.pricing);
                                                } else {
                                                  await updateDoc(doc(db, 'events', event.id, 'attendees', rsvp.id), { paymentStatus: newStatus, updatedAt: serverTimestamp() });
                                                }
                                                toast.success(
                                                  newStatus === 'paid'
                                                    ? 'Marked as paid (transaction logged)'
                                                    : 'Marked as pending payment'
                                                );
                                              } catch (error) {
                                                console.error('Error updating payment status:', error);
                                                toast.error('Failed to update payment status');
                                              }
                                            }}
                                            className="w-full rounded border border-[#FFA000] bg-[#FFC107] px-2 py-1 font-bold text-white hover:bg-[#FFA000]"
                                          >
                                            {rsvp.paymentStatus === 'paid' ? 'Mark Unpaid' : 'Mark Paid'}
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="text-gray-500">N/A</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-[11px] text-gray-600">
                                      <div>
                                        RSVP: {rsvp.createdAt ? new Date(rsvp.createdAt.toDate ? rsvp.createdAt.toDate() : rsvp.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown'}
                                      </div>
                                      {rsvp.updatedAt && (
                                        <div className="mt-1">
                                          Updated: {new Date(rsvp.updatedAt.toDate ? rsvp.updatedAt.toDate() : rsvp.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex min-w-[150px] flex-col gap-2">
                                        <select
                                          value={rsvp.status || rsvp.rsvpStatus || ''}
                                          onChange={(e) => {
                                            const newStatus = e.target.value as 'going' | 'not-going' | 'waitlisted' | '';
                                            updateRsvp(event.id, rsvp.id, newStatus || null);
                                          }}
                                          className="w-full rounded border border-gray-300 px-2 py-1 focus:ring-2 focus:ring-[#F25129]"
                                        >
                                          <option value="going">Going</option>
                                          <option value="not-going">Not Going</option>
                                          <option value="waitlisted">Waitlisted</option>
                                          <option value="">Remove</option>
                                        </select>
                                        {(rsvp.status || rsvp.rsvpStatus) === 'waitlisted' && (
                                          <button onClick={() => updateRsvp(event.id, rsvp.id, 'going')} className="w-full rounded bg-green-600 px-2 py-1 text-white hover:bg-green-700">Promote</button>
                                        )}
                                        {analyzeLastMinuteChanges(rsvp, event.startAt) > 0 && (
                                          <button onClick={() => blockUserFromRsvp(rsvp.userId)} className="w-full rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700">Block</button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}</>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <span className="text-4xl">📭</span>
                  <p className="text-sm text-gray-600 mt-2">No RSVPs yet for this event</p>
                  <p className="text-xs text-gray-500">Responses will appear here as members RSVP</p>
                  <p className="text-xs text-[#FFC107] mt-2">
                    💡 Use the +Count/-Count buttons above to manually adjust attendance for walk-ins or corrections
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
        {filteredEvents.length >= PAGE_SIZE * eventsPage && (
          <button
            onClick={() => setEventsPage(eventsPage + 1)}
            className="mt-4 px-4 py-2 bg-[#F25129] text-white rounded-full hover:bg-[#E0451F]"
            aria-label="Load more events"
          >
            Load More Events
          </button>
        )}
      </div>
    )}
  </div>
  );
};








