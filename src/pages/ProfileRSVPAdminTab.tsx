import React, { useState } from 'react';
import { Calendar, Eye, EyeOff } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import EventCard from '../components/events/EventCard';

interface Event {
  id: string;
  title: string;
  description: string;
  startAt: any;
  endAt?: any;
  location: string;
  createdBy: string;
  attendingCount: number;
  maxAttendees?: number;
  imageUrl?: string;
}

type ProfileRSVPAdminTabProps = {
  rsvpsByEvent: { [eventId: string]: any[] };
  allEvents: Event[];
  userNames: { [userId: string]: string };
  updateRsvp: (eventId: string, userId: string, status: 'going' | 'not-going' | null) => Promise<void>;
  exportRsvps: (event: Event) => Promise<void>;
  exportingRsvps: string | null;
  adjustAttendingCount: (eventId: string, increment: boolean) => Promise<void>;
  blockUserFromRsvp: (userId: string) => Promise<void>;
  analyzeLastMinuteChanges: (rsvp: any, eventStart: any) => number;
  rsvpFilter: 'all' | 'going' | 'not-going';
  setRsvpFilter: (value: 'all' | 'going' | 'not-going') => void;
  eventsPage: number;
  setEventsPage: (value: number) => void;
  PAGE_SIZE: number;
  loadingAdminEvents: boolean;
  currentUser: any;
};

export const ProfileRSVPAdminTab: React.FC<ProfileRSVPAdminTabProps> = ({
  rsvpsByEvent,
  allEvents,
  userNames,
  updateRsvp,
  exportRsvps,
  exportingRsvps,
  adjustAttendingCount,
  blockUserFromRsvp,
  analyzeLastMinuteChanges,
  rsvpFilter,
  setRsvpFilter,
  eventsPage,
  setEventsPage,
  PAGE_SIZE,
  loadingAdminEvents,
  currentUser,
}) => {
  // NEW: Event filtering state
  const [eventFilter, setEventFilter] = React.useState('');
  const [filteredEvents, setFilteredEvents] = React.useState<Event[]>(allEvents);
  
  // NEW: User details state for email/phone show/hide
  const [userDetails, setUserDetails] = useState<{[userId: string]: {email?: string; phone?: string}}>({});
  const [showContactInfo, setShowContactInfo] = useState<{[userId: string]: boolean}>({});
  
  // NEW: Per-event RSVP filter state (instead of global)
  const [eventRsvpFilters, setEventRsvpFilters] = useState<{[eventId: string]: 'all' | 'going' | 'not-going'}>({});
  
  // NEW: Date and Activity filter state
  const [dateFilter, setDateFilter] = useState<'all' | 'upcoming' | 'this-week' | 'past'>('all');
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
  
  // NEW: Sorting state
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'location' | 'rsvp-count'>('date');
  
  // Function to fetch user email and phone details
  const fetchUserDetails = async (userId: string) => {
    if (userDetails[userId]) return; // Already fetched
    
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setUserDetails(prev => ({
          ...prev,
          [userId]: {
            email: userData.email || 'Not provided',
            phone: userData.phone || 'Not provided'
          }
        }));
      }
    } catch (error) {
      console.error('Error fetching user details:', error);
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
    if (!showContactInfo[userId]) {
      await fetchUserDetails(userId);
    }
    setShowContactInfo(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };
  
  // Function to update per-event RSVP filter
  const updateEventRsvpFilter = (eventId: string, filter: 'all' | 'going' | 'not-going') => {
    setEventRsvpFilters(prev => ({
      ...prev,
      [eventId]: filter
    }));
  };
  
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
    
    // NEW: Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          if (!a.startAt || !b.startAt) return 0;
          const dateA = a.startAt.toDate ? a.startAt.toDate() : new Date(a.startAt);
          const dateB = b.startAt.toDate ? b.startAt.toDate() : new Date(b.startAt);
          return dateA.getTime() - dateB.getTime();
        case 'title':
          return a.title.localeCompare(b.title);
        case 'location':
          return a.location.localeCompare(b.location);
        case 'rsvp-count':
          const countA = rsvpsByEvent[a.id]?.length || 0;
          const countB = rsvpsByEvent[b.id]?.length || 0;
          return countB - countA; // High to low
        default:
          return 0;
      }
    });
    
    setFilteredEvents(filtered);
  }, [eventFilter, dateFilter, activityFilter, locationFilter, dateRangeFilter, creatorFilter, maxAttendeesFilter, sortBy, allEvents, rsvpsByEvent]);

  return (
  <div className="grid gap-6">
    <div className="flex items-center gap-2">
      <h2 className="text-sm font-semibold text-gray-700">RSVP Management & Analytics</h2>
      <button
        onClick={() => {
          setRsvpFilter('all');        // Reset RSVP status filter
          setEventFilter('');          // Reset event search filter
          setEventRsvpFilters({});     // Reset all per-event RSVP filters
          setDateFilter('all');        // Reset date filter
          setActivityFilter('all');    // Reset activity filter
          setLocationFilter('');       // Reset location filter
          setDateRangeFilter({ startDate: '', endDate: '', enabled: false }); // Reset date range
          setCreatorFilter('');        // Reset creator filter
          setMaxAttendeesFilter({ min: '', max: '', enabled: false }); // Reset attendee range
          setShowAdvancedSearch(false); // Hide advanced search
          setSortBy('date');           // Reset sorting to date
        }}
        className="ml-4 text-xs text-purple-600 hover:underline"
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
      <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✅</span>
          <div>
            <div className="text-sm text-blue-600 font-medium">Going</div>
            <div className="text-2xl font-bold text-blue-800">
              {Object.values(rsvpsByEvent).reduce((sum, rsvps) => sum + rsvps.filter(r => r.status === 'going').length, 0)}
            </div>
          </div>
        </div>
      </div>
      <div className="p-4 bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg border border-yellow-200">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🤔</span>
          <div>
            <div className="text-sm text-yellow-600 font-medium">Maybe</div>
            <div className="text-2xl font-bold text-yellow-800">
              {Object.values(rsvpsByEvent).reduce((sum, rsvps) => sum + rsvps.filter(r => r.status === 'maybe').length, 0)}
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
              {Object.values(rsvpsByEvent).reduce((sum, rsvps) => sum + rsvps.filter(r => r.status === 'not-going').length, 0)}
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
                const userName = userNames[rsvp.id] || 'Unknown User';
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
    
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-center gap-2 text-blue-800">
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
    <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
             <div className="flex items-center justify-between mb-3">
         <h3 className="text-lg font-semibold text-purple-800">Event Filtering</h3>
         <div className="flex items-center gap-3">
           {/* NEW: Sorting Options */}
           <div className="flex items-center gap-2">
             <span className="text-xs text-purple-600 font-medium">Sort by:</span>
             <select
               value={sortBy}
               onChange={(e) => setSortBy(e.target.value as 'date' | 'title' | 'location' | 'rsvp-count')}
               className="px-2 py-1 text-xs border border-purple-200 rounded focus:ring-1 focus:ring-purple-500"
             >
               <option value="date">📅 Date</option>
               <option value="title">📝 Title</option>
               <option value="location">📍 Location</option>
               <option value="rsvp-count">👥 RSVP Count</option>
             </select>
           </div>
           <span className="text-sm text-purple-600">
             {filteredEvents.length} of {allEvents.length} events
           </span>
         </div>
       </div>
      
      {/* NEW: Quick Date Range Filter Pills */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {[
          { value: 'all', label: 'All Events', icon: '📅' },
          { value: 'upcoming', label: 'Upcoming', icon: '⏰' },
          { value: 'this-week', label: 'This Week', icon: '📆' },
          { value: 'past', label: 'Past', icon: '📚' }
        ].map(filter => (
          <button
            key={filter.value}
            onClick={() => setDateFilter(filter.value as 'all' | 'upcoming' | 'this-week' | 'past')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              dateFilter === filter.value
                ? 'bg-purple-100 border-purple-300 text-purple-800 ring-2 ring-purple-200'
                : 'bg-white border-purple-200 text-purple-700 hover:bg-purple-50'
            }`}
            title={`Filter by ${filter.label}`}
          >
            {filter.icon} {filter.label}
          </button>
        ))}
      </div>
      
             {/* NEW: RSVP Activity Filter Pills */}
       <div className="flex gap-2 mb-3 flex-wrap">
         {[
           { value: 'all', label: 'All Activity', icon: '📊', count: Object.values(rsvpsByEvent).reduce((sum, rsvps) => sum + rsvps.length, 0) },
           { value: 'has-rsvps', label: 'Has RSVPs', icon: '✅', count: allEvents.filter(e => rsvpsByEvent[e.id]?.length > 0).length },
           { value: 'no-rsvps', label: 'No RSVPs', icon: '📭', count: allEvents.filter(e => !rsvpsByEvent[e.id]?.length).length },
           { value: 'high-activity', label: 'High Activity', icon: '🔥', count: allEvents.filter(e => (rsvpsByEvent[e.id]?.length || 0) >= 5).length }
         ].map(filter => (
           <button
             key={filter.value}
             onClick={() => setActivityFilter(filter.value as 'all' | 'has-rsvps' | 'no-rsvps' | 'high-activity')}
             className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
               activityFilter === filter.value
                 ? 'bg-blue-100 border-blue-300 text-blue-800 ring-2 ring-blue-200'
                 : 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50'
             }`}
             title={`${filter.label}: ${filter.count} events`}
           >
             {filter.icon} {filter.label} ({filter.count})
           </button>
         ))}
       </div>
       
               {/* NEW: Advanced Search Toggle - Converted to Icon */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
            className={`p-2 rounded-full transition-all ${
              showAdvancedSearch 
                ? 'bg-purple-100 text-purple-800 ring-2 ring-purple-300' 
                : 'bg-white text-purple-600 hover:bg-purple-50 hover:scale-105'
            }`}
            title={showAdvancedSearch ? 'Hide Advanced Search' : 'Show Advanced Search'}
            aria-label={showAdvancedSearch ? 'Hide Advanced Search' : 'Show Advanced Search'}
          >
            {showAdvancedSearch ? '🔽' : '⚙️'}
          </button>
          <span className="text-xs text-purple-600">
            {showAdvancedSearch ? (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Advanced filters active
              </span>
            ) : (
              'Click ⚙️ to expand'
            )}
          </span>
        </div>
       
       {/* NEW: Advanced Search Panel */}
       {showAdvancedSearch && (
         <div className="p-4 bg-white border border-purple-200 rounded-lg mb-3">
           <div className="grid md:grid-cols-2 gap-4">
             {/* Location Filter */}
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-2">
                 📍 Location Filter
               </label>
               <input
                 type="text"
                 placeholder="Filter by location..."
                 value={locationFilter}
                 onChange={(e) => setLocationFilter(e.target.value)}
                 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
               />
             </div>
             
             {/* Creator Filter */}
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-2">
                 👤 Creator Filter
               </label>
               <input
                 type="text"
                 placeholder="Filter by creator..."
                 value={creatorFilter}
                 onChange={(e) => setCreatorFilter(e.target.value)}
                 className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
               />
             </div>
             
             {/* Date Range Filter */}
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-2">
                 📅 Date Range Filter
               </label>
               <div className="flex items-center gap-2 mb-2">
                 <input
                   type="checkbox"
                   checked={dateRangeFilter.enabled}
                   onChange={(e) => setDateRangeFilter(prev => ({ ...prev, enabled: e.target.checked }))}
                   className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                 />
                 <span className="text-sm text-gray-600">Enable date range</span>
               </div>
               {dateRangeFilter.enabled && (
                 <div className="grid grid-cols-2 gap-2">
                   <input
                     type="date"
                     value={dateRangeFilter.startDate}
                     onChange={(e) => setDateRangeFilter(prev => ({ ...prev, startDate: e.target.value }))}
                     className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                   />
                   <input
                     type="date"
                     value={dateRangeFilter.endDate}
                     onChange={(e) => setDateRangeFilter(prev => ({ ...prev, endDate: e.target.value }))}
                     className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                   />
                 </div>
               )}
             </div>
             
             {/* Max Attendees Filter */}
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-2">
                 👥 Max Attendees Filter
               </label>
               <div className="flex items-center gap-2 mb-2">
                 <input
                   type="checkbox"
                   checked={maxAttendeesFilter.enabled}
                   onChange={(e) => setMaxAttendeesFilter(prev => ({ ...prev, enabled: e.target.checked }))}
                   className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
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
                     className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                   />
                   <input
                     type="number"
                     placeholder="Max"
                     value={maxAttendeesFilter.max}
                     onChange={(e) => setMaxAttendeesFilter(prev => ({ ...prev, max: e.target.value }))}
                     className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                   />
                 </div>
               )}
             </div>
           </div>
           
           {/* NEW: Active Advanced Filters Summary */}
           {(locationFilter || creatorFilter || dateRangeFilter.enabled || maxAttendeesFilter.enabled) && (
             <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
               <div className="flex items-center gap-2 mb-2">
                 <span className="text-sm font-medium text-green-700">🎯 Active Advanced Filters:</span>
               </div>
               <div className="flex flex-wrap gap-2 text-xs">
                 {locationFilter && (
                   <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full">
                     📍 Location: {locationFilter}
                   </span>
                 )}
                 {creatorFilter && (
                   <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full">
                     👤 Creator: {creatorFilter}
                   </span>
                 )}
                 {dateRangeFilter.enabled && (
                   <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full">
                     📅 Date Range: {dateRangeFilter.startDate} to {dateRangeFilter.endDate}
                   </span>
                 )}
                 {maxAttendeesFilter.enabled && (
                   <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full">
                     👥 Attendees: {maxAttendeesFilter.min || '0'} - {maxAttendeesFilter.max || '∞'}
                   </span>
                 )}
               </div>
             </div>
           )}
         </div>
       )}
       
       <div className="flex gap-3 items-center">
        <input
          type="text"
          placeholder="Search events by title, description, or location..."
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="flex-1 px-4 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
        <button
          onClick={() => setEventFilter('')}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          Clear Filter
        </button>
      </div>
    </div>
    
    {/* Events with RSVP Management */}
    {loadingAdminEvents ? (
      <div className="text-center py-8 bg-gray-50 rounded-lg">
        <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-2"></div>
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
        <h3 className="text-lg font-semibold text-gray-800">Event RSVP Details</h3>
        {filteredEvents.map((event, index) => (
          <div 
            key={event.id} 
            className={`space-y-4 p-4 rounded-lg ${
              index % 2 === 0 
                ? 'bg-blue-50/50 border-l-4 border-blue-200' 
                : 'bg-pink-50/50 border-l-4 border-pink-200'
            }`}
          >
            {/* EventCard for consistent display - WITH top action icons in RSVP tab */}
            <EventCard
              event={event}
              onEdit={undefined} // RSVP tab doesn't need edit functionality
              onDelete={undefined} // RSVP tab doesn't need delete functionality
              onShare={undefined} // RSVP tab doesn't need share functionality
              showAdminActions={false} // Hide Edit/Delete buttons in RSVP tab
              showTopActions={true} // Show action icons at top-right (calendar only)
              showCalendarButton={false} // Hide the large Add to Calendar button
            />
            

            {/* RSVP Management Section */}
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-gray-700">
                    📋 RSVP Management
                  </h4>
                  <span className="text-xs text-gray-500 font-normal">
                    ({rsvpsByEvent[event.id]?.length || 0} total responses)
                  </span>
                </div>
                
                                 {/* Export CSV Button - Converted to Icon */}
                                   <button
                    onClick={() => exportRsvps(event)}
                    disabled={exportingRsvps === event.id}
                    className={`p-2 rounded-full transition-colors ${
                      exportingRsvps === event.id
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 hover:scale-105'
                    } text-white`}
                    title={exportingRsvps === event.id ? 'Exporting...' : 'Export RSVPs CSV'}
                    aria-label={`Export RSVPs for ${event.title}`}
                  >
                    {exportingRsvps === event.id ? (
                      <span className="text-sm">⏳</span>
                    ) : (
                      <span className="text-sm">📊</span>
                    )}
                  </button>
              </div>
              
                             {/* ATTENDANCE MANAGEMENT - COMPACT & PROFESSIONAL */}
               <div className="mb-4 p-3 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200">
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <span className="text-sm text-blue-600">
                       Update attendance (<strong className="text-blue-800 font-bold text-base">{Math.max(0, event.attendingCount || 0)} checked in</strong>)
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
              
              {/* RSVP DATA SECTION - Only show when there are actual RSVPs */}
              {rsvpsByEvent[event.id]?.length ? (
                <>
                  {/* RSVP Summary Dashboard */}
                  <div className="mb-4 p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700">Response Summary</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                        <span>Going: <strong>{rsvpsByEvent[event.id].filter(r => r.status === 'going').length}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                        <span>Maybe: <strong>{rsvpsByEvent[event.id].filter(r => r.status === 'maybe').length}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                        <span>Not Going: <strong>{rsvpsByEvent[event.id].filter(r => r.status === 'not-going').length}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                        <span>Total: <strong>{rsvpsByEvent[event.id].length}</strong></span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="text-xs text-gray-600 space-y-1">
                        <div>
                          <span className="font-medium text-green-700">Going:</span>{' '}
                          {rsvpsByEvent[event.id]
                            .filter(r => r.status === 'going')
                            .map(r => userNames[r.id] || 'Loading...')
                            .join(', ') || 'None'}
                        </div>
                        <div>
                          <span className="font-medium text-yellow-700">Maybe:</span>{' '}
                          {rsvpsByEvent[event.id]
                            .filter(r => r.status === 'maybe')
                            .map(r => userNames[r.id] || 'Loading...')
                            .join(', ') || 'None'}
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Detailed RSVP List */}
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mt-4">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Detailed RSVP List</span>
                        <select
                          value={getEventRsvpFilter(event.id)}
                          onChange={(e) => updateEventRsvpFilter(event.id, e.target.value as 'all' | 'going' | 'maybe' | 'not-going')}
                          className="px-2 py-1 rounded border border-gray-300 focus:ring-2 focus:ring-purple-500 text-xs"
                          aria-label={`Filter RSVPs for ${event.title}`}
                        >
                          <option value="all">All</option>
                          <option value="going">Going</option>
        
                          <option value="not-going">Not Going</option>
                        </select>
                      </div>
                      
                      {/* NEW: Quick Status Filter Pills */}
                      <div className="flex gap-2 flex-wrap">
                        {[
                          { value: 'all', label: 'All', count: rsvpsByEvent[event.id]?.length || 0, color: 'bg-gray-100 text-gray-700' },
                          { value: 'going', label: 'Going', count: rsvpsByEvent[event.id]?.filter(r => r.status === 'going').length || 0, color: 'bg-green-100 text-green-700' },
                          { value: 'maybe', label: 'Maybe', count: rsvpsByEvent[event.id]?.filter(r => r.status === 'maybe').length || 0, color: 'bg-yellow-100 text-yellow-700' },
                          { value: 'not-going', label: 'Not Going', count: rsvpsByEvent[event.id]?.filter(r => r.status === 'not-going').length || 0, color: 'bg-red-100 text-red-700' }
                        ].map(filter => (
                          <button
                            key={filter.value}
                            onClick={() => updateEventRsvpFilter(event.id, filter.value as 'all' | 'going' | 'maybe' | 'not-going')}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                              getEventRsvpFilter(event.id) === filter.value
                                ? filter.color + ' ring-2 ring-offset-1 ring-gray-400'
                                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                            }`}
                            title={`${filter.label}: ${filter.count} responses`}
                          >
                            {filter.label} ({filter.count})
                          </button>
                        ))}
                      </div>
                    </div>
                    <ul className="divide-y divide-gray-200 max-h-60 overflow-y-auto">
                      {rsvpsByEvent[event.id]
                        .filter(r => getEventRsvpFilter(event.id) === 'all' || r.status === getEventRsvpFilter(event.id))
                        .map(rsvp => (
                          <li key={rsvp.id} className="px-4 py-3 flex justify-between items-center hover:bg-gray-50">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm text-gray-900">
                                  {userNames[rsvp.id] || 'Loading...'}
                                </span>
                                <button
                                  onClick={() => toggleContactInfo(rsvp.id)}
                                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                  title={showContactInfo[rsvp.id] ? 'Hide contact info' : 'Show contact info'}
                                >
                                  {showContactInfo[rsvp.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                  {showContactInfo[rsvp.id] ? 'Hide' : 'Show'} Contact
                                </button>
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    rsvp.status === 'going'
                                      ? 'bg-green-100 text-green-800'
                                      : rsvp.status === 'maybe'
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}
                                >
                                  {rsvp.status === 'going' ? '✅ Going' : rsvp.status === 'maybe' ? '🤔 Maybe' : '❌ Not Going'}
                                </span>
                              </div>
                              
                              {/* Show contact info when toggled */}
                              {showContactInfo[rsvp.id] && userDetails[rsvp.id] && (
                                <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-800 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">📧 Email:</span>
                                    <span>{userDetails[rsvp.id].email}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">📱 Phone:</span>
                                    <span>{userDetails[rsvp.id].phone}</span>
                                  </div>
                                </div>
                              )}
                              <div className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                                <span>
                                  📅 RSVP:{' '}
                                  {rsvp.createdAt?.toDate?.()
                                    ? new Date(rsvp.createdAt.toDate()).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })
                                    : 'Unknown'}
                                </span>
                                {rsvp.updatedAt && (
                                  <span>
                                    🔄 Updated:{' '}
                                    {new Date(rsvp.updatedAt.toDate()).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                )}
                              </div>
                              
                              {/* RSVP HISTORY VIEW - Easy to develop, low risk */}
                              {rsvp.statusHistory && rsvp.statusHistory.length > 1 && (
                                <details className="mt-2 text-xs">
                                  <summary className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium">
                                    📋 View RSVP History ({rsvp.statusHistory.length} changes)
                                  </summary>
                                  <div className="mt-2 pl-4 space-y-1">
                                    {rsvp.statusHistory.map((history: any, index: number) => (
                                      <div key={index} className="flex items-center gap-2 text-gray-600">
                                        <span className={`w-2 h-2 rounded-full ${
                                          history.status === 'going' ? 'bg-green-500' :
                                          history.status === 'maybe' ? 'bg-yellow-500' :
                                          'bg-red-500'
                                        }`}></span>
                                        <span className="font-medium capitalize">
                                          {history.status === 'not-going' ? "Can't Go" : history.status}
                                        </span>
                                        <span>•</span>
                                        <span>
                                          {history.changedAt?.toDate?.()
                                            ? new Date(history.changedAt.toDate()).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                              })
                                            : 'Unknown time'}
                                        </span>
                                        {history.changedBy && (
                                          <>
                                            <span>•</span>
                                            <span className="text-gray-500">
                                              by {userNames[history.changedBy] || history.changedBy.slice(0, 8) + '...'}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <select
                                value={rsvp.status}
                                onChange={(e) => {
                                  const newStatus = e.target.value as 'going' | 'maybe' | 'not-going' | '';
                                  updateRsvp(event.id, rsvp.id, newStatus || null);
                                }}
                                className="px-2 py-1 rounded border border-gray-300 focus:ring-2 focus:ring-purple-500 text-xs"
                                aria-label={`Change RSVP status for ${userNames[rsvp.id] || rsvp.id}`}
                              >
                                <option value="going">✅ Going</option>
              
                                <option value="not-going">❌ Not Going</option>
                                <option value="">🗑️ Remove</option>
                              </select>
                              {analyzeLastMinuteChanges(rsvp, event.startAt) > 0 && (
                                <button
                                  onClick={() => blockUserFromRsvp(rsvp.id)}
                                  className="ml-2 px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-xs"
                                  aria-label={`Block ${userNames[rsvp.id] || rsvp.id} from RSVPing`}
                                >
                                  Block
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                    </ul>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <span className="text-4xl">📭</span>
                  <p className="text-sm text-gray-600 mt-2">No RSVPs yet for this event</p>
                  <p className="text-xs text-gray-500">Responses will appear here as members RSVP</p>
                  <p className="text-xs text-blue-600 mt-2">
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
            className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-full hover:bg-purple-700"
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