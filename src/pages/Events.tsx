import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, Calendar, TrendingUp } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
// COMMENTED OUT: Unused imports for layout testing
// import { Share2, Plus, Tag } from 'lucide-react';
import EventCalendar from '../components/events/EventCalendar';
import EventList from '../components/events/EventList';
import CreateEventModal from '../components/events/CreateEventModal';
import { useEvents } from '../hooks/useEvents';
import { useRealTimeEvents } from '../hooks/useRealTimeEvents';
import { useAuth } from '../contexts/AuthContext';
import { EventsListSeo } from '../components/seo/EventsListSeo';
// import { useUserBlocking } from '../hooks/useUserBlocking'; // For future RSVP blocking feature
import { EventDoc } from '../hooks/useEvents';
import { RSVPModalNew as RSVPModal } from '../components/events/RSVPModalNew';
import { EventTeaserModal } from '../components/events/EventTeaserModal';
import { PastEventModal } from '../components/events/PastEventModal';
// COMMENTED OUT: toast import for layout testing
// import toast from 'react-hot-toast';
import { useDebounce } from 'use-debounce';

// ============================================
// RSVP MODE TOGGLE - Easy revert option
// ============================================
// Set to 'modal' to use modal (original behavior)
// Set to 'page' to use new page navigation
const RSVP_MODE: 'modal' | 'page' = 'page';  // ← Change this to 'modal' to revert
// ============================================

const Events: React.FC = () => {
  const { currentUser } = useAuth();
  const { eventId } = useParams<{ eventId?: string }>();
  const navigate = useNavigate();
  const { upcomingEvents, pastEvents, loading, error } = useEvents({ includeGuestTeasers: true });
  
  // Real-time updates
  const { 
    events: realTimeEvents
    // COMMENTED OUT: lastUpdate for layout testing
    // lastUpdate
  } = useRealTimeEvents({
    enableNotifications: false,
    enableRealTimeUpdates: true,
    userId: currentUser?.id,
    isApproved: currentUser ? (currentUser.status === 'approved' || !currentUser.status) : false
  });

  const [activeTab, setActiveTab] = useState<'upcoming'|'past'>('upcoming');
  const [viewMode, setViewMode] = useState<'grid'|'calendar'>('grid');
  const [showModal, setShowModal] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
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
  const [capacityFilter, setCapacityFilter] = useState<{
    min: string;
    max: string;
    enabled: boolean;
  }>({
    min: '',
    max: '',
    enabled: false
  });
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'location' | 'popularity'>('date');


  // Modal states for calendar events
  const [selectedEvent, setSelectedEvent] = useState<EventDoc | null>(null);
  const [showRSVPModal, setShowRSVPModal] = useState(false);
  const [showTeaserModal, setShowTeaserModal] = useState(false);
  const [selectedPastEvent, setSelectedPastEvent] = useState<EventDoc | null>(null);
  const [showPastEventModal, setShowPastEventModal] = useState(false);

  // Auto-open modal if eventId is in URL
  useEffect(() => {
    if (eventId) {
      const allEvents = [...upcomingEvents, ...pastEvents];
      const targetEvent = allEvents.find(event => event.id === eventId);
      if (targetEvent) {
        // Flexible RSVP handling based on toggle
        if (RSVP_MODE === 'page') {
          // Navigate to new RSVP page
          navigate(`/events/${targetEvent.id}/rsvp`);
        } else {
          // Use original modal (revert option)
          setSelectedEvent(targetEvent);
          setShowRSVPModal(true);
        }
      }
    }
  }, [eventId, upcomingEvents, pastEvents]);

  // Debounce search input - only search after user stops typing for 300ms
  const [debouncedSearch] = useDebounce(searchInput, 300);

  // Use real-time events if available, fallback to regular events
  const baseList = useMemo(() => {
    if (realTimeEvents.length > 0 && activeTab === 'upcoming') {
      return realTimeEvents;
    }
    return activeTab === 'upcoming' ? upcomingEvents : pastEvents;
  }, [realTimeEvents, upcomingEvents, pastEvents, activeTab]);

  // Debug logging for event data
  useEffect(() => {
    console.log('🔍 Events.tsx - Event data debug:', {
      activeTab,
      upcomingEventsCount: upcomingEvents.length,
      pastEventsCount: pastEvents.length,
      realTimeEventsCount: realTimeEvents.length,
      baseListCount: baseList.length,
      pastEvents: Array.isArray(pastEvents) ? pastEvents.map(e => ({ id: e.id, title: e.title, startAt: e.startAt })) : []
    });
  }, [activeTab, upcomingEvents, pastEvents, realTimeEvents, baseList]);

  const allTags = useMemo(() => {
    if (!Array.isArray(baseList)) {
      console.warn('baseList is not an array:', baseList);
      return [];
    }
    return [...new Set(baseList.flatMap(e => Array.isArray(e?.tags) ? e.tags : []))];
  }, [baseList]);
  
  // Filter tags based on search input
  const filteredTags = useMemo(() => {
    if (!tagSearch.trim()) return allTags.slice(0, 10); // Show top 10 tags when no search
    return allTags.filter(tag => 
      tag.toLowerCase().includes(tagSearch.toLowerCase())
    ).slice(0, 10); // Limit to 10 results
  }, [allTags, tagSearch]);

  // const { blockedUsers } = useUserBlocking(); // For future RSVP blocking feature

  // Advanced filtering and sorting
  const filtered = useMemo(() => {
    console.log('🔍 Events.tsx - filtered useMemo called with baseList:', {
      baseListType: typeof baseList,
      baseListIsArray: Array.isArray(baseList),
      baseListLength: Array.isArray(baseList) ? baseList.length : 'N/A',
      baseListConstructor: baseList?.constructor?.name,
      baseListSample: Array.isArray(baseList) ? baseList.slice(0, 2) : baseList
    });
    
    if (!Array.isArray(baseList)) {
      console.warn('🚨 Events.tsx - baseList is not an array in filtered useMemo:', {
        baseList,
        type: typeof baseList,
        constructor: baseList?.constructor?.name,
        stack: new Error().stack
      });
      return [];
    }
    let list = baseList.filter(e => {
      // Basic search filter
      const q = debouncedSearch.trim().toLowerCase();
      const okTag = selectedTag ? (e.tags || []).includes(selectedTag) : true;
      
      // Search in title, location, venue name, venue address, and tags
      const okSearch = q ? (
        (e.title || '').toLowerCase().includes(q) ||
        (e.location || '').toLowerCase().includes(q) ||
        (e.venueName || '').toLowerCase().includes(q) ||
        (e.venueAddress || '').toLowerCase().includes(q) ||
        (e.tags || []).some(tag => tag.toLowerCase().includes(q))
      ) : true;
      
      if (!okSearch || !okTag) return false;

      // Location filter - search in location, venue name, and venue address
      if (locationFilter) {
        const locationMatch = (
          (e.location || '').toLowerCase().includes(locationFilter.toLowerCase()) ||
          (e.venueName || '').toLowerCase().includes(locationFilter.toLowerCase()) ||
          (e.venueAddress || '').toLowerCase().includes(locationFilter.toLowerCase())
        );
        if (!locationMatch) return false;
      }

      // Date range filter
      if (dateRangeFilter.enabled && (dateRangeFilter.startDate || dateRangeFilter.endDate)) {
        let eventDate: Date;
        
        try {
          // Handle Firestore Timestamp with toDate method
          if (e.startAt?.toDate && typeof e.startAt.toDate === 'function') {
            eventDate = e.startAt.toDate();
          }
          // Handle Firestore Timestamp with seconds property
          else if (e.startAt?.seconds && typeof e.startAt.seconds === 'number') {
            eventDate = new Date(e.startAt.seconds * 1000 + (e.startAt.nanoseconds || 0) / 1000000);
          }
          // Handle JavaScript Date
          else if (e.startAt instanceof Date) {
            eventDate = e.startAt;
          }
          // Handle timestamp number (milliseconds)
          else if (typeof e.startAt === 'number') {
            eventDate = new Date(e.startAt);
          }
          // Handle timestamp string
          else if (typeof e.startAt === 'string') {
            eventDate = new Date(e.startAt);
            if (isNaN(eventDate.getTime())) {
              console.warn('Invalid date string:', e.startAt);
              return false;
            }
          }
          else {
            console.warn('Unknown date format:', e.startAt);
            return false;
          }
          
          if (dateRangeFilter.startDate) {
            const startDate = new Date(dateRangeFilter.startDate);
            if (eventDate < startDate) return false;
          }
          
          if (dateRangeFilter.endDate) {
            const endDate = new Date(dateRangeFilter.endDate);
            if (eventDate > endDate) return false;
          }
        } catch (error) {
          console.error('Error filtering by date range:', e.startAt, error);
          return false;
        }
      }

      // Capacity filter
      if (capacityFilter.enabled && e.maxAttendees) {
        const min = capacityFilter.min ? parseInt(capacityFilter.min) : 0;
        const max = capacityFilter.max ? parseInt(capacityFilter.max) : Infinity;
        
        if (e.maxAttendees < min || e.maxAttendees > max) return false;
      }

      return true;
    });

    // Remove duplicates and sort
    const map = new Map(Array.isArray(list) ? list.map(e => [e.id, e]) : []);
    list = Array.from(map.values());

    // Sorting
    list.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return (a.title || '').localeCompare(b.title || '');
        case 'location':
          // Sort by venue name first, then location, then venue address
          const aLocation = (a.venueName || a.location || a.venueAddress || '').toLowerCase();
          const bLocation = (b.venueName || b.location || b.venueAddress || '').toLowerCase();
          return aLocation.localeCompare(bLocation);
        case 'popularity':
          // Sort by maxAttendees (higher capacity = more popular)
          return (b.maxAttendees || 0) - (a.maxAttendees || 0);
        case 'date':
        default:
          // Safe comparison of timestamps
          try {
            const aTime = a.startAt?.seconds || 0;
            const bTime = b.startAt?.seconds || 0;
            return aTime - bTime;
          } catch (error) {
            console.error('Error comparing event dates:', error);
            return 0;
          }
      }
    });

    return list;
  }, [baseList, debouncedSearch, selectedTag, locationFilter, dateRangeFilter, capacityFilter, sortBy]);

  const onSelectCalEvent = (e: EventDoc) => {
    console.log('🔍 Calendar event clicked:', {
      id: e.id,
      title: e.title,
      visibility: e.visibility,
      currentUser: !!currentUser,
      activeTab
    });

    // Check if user is blocked from RSVP (for future use)
    // const isBlockedFromRSVP = blockedUsers.some((block: any) => 
    //   block.blockCategory === 'rsvp_only' && block.isActive
    // );

    // Check if event is past
    const isEventPast = () => {
      if (!e.startAt) return false;
      
      try {
        // Handle Firestore Timestamp with toDate method
        if (e.startAt.toDate && typeof e.startAt.toDate === 'function') {
          return e.startAt.toDate() < new Date();
        }
        
        // Handle Firestore Timestamp with seconds property
        if (e.startAt.seconds && typeof e.startAt.seconds === 'number') {
          return new Date(e.startAt.seconds * 1000 + (e.startAt.nanoseconds || 0) / 1000000) < new Date();
        }
        
        // Handle JavaScript Date
        if (e.startAt instanceof Date) {
          return e.startAt < new Date();
        }
        
        // Handle timestamp number (milliseconds)
        if (typeof e.startAt === 'number') {
          return new Date(e.startAt) < new Date();
        }
        
        // Handle timestamp string
        if (typeof e.startAt === 'string') {
          const date = new Date(e.startAt);
          if (isNaN(date.getTime())) {
            console.warn('Invalid date string:', e.startAt);
            return false;
          }
          return date < new Date();
        }
        
        console.warn('Unknown date format:', e.startAt);
        return false;
      } catch (error) {
        console.error('Error checking if event is past:', e.startAt, error);
        return false;
      }
    };

    const eventIsPast = isEventPast();

    // For past events, always show past event modal
    if (eventIsPast) {
      console.log('🔍 Opening PastEventModal for past event from calendar:', e.title);
      setSelectedPastEvent(e);
      setShowPastEventModal(true);
      return;
    }

    // For non-past events, handle based on user authentication
    if (!currentUser) {
      console.log('🔍 Opening EventTeaserModal for non-authenticated user from calendar');
      setSelectedEvent(e);
      setShowTeaserModal(true);
    } else {
      console.log('🔍 Opening RSVP for authenticated user from calendar');
      // Flexible RSVP handling based on toggle
      if (RSVP_MODE === 'page') {
        // Navigate to new RSVP page
        navigate(`/events/${e.id}/rsvp`);
      } else {
        // Use original modal (revert option)
        setSelectedEvent(e);
        setShowRSVPModal(true);
      }
    }
  };



  // COMMENTED OUT: Share current events page function for layout testing
  // const shareEventsPage = async () => {
  //   if (navigator.share) {
  //     try {
  //       await navigator.share({
  //         title: 'Events',
  //         text: 'Check out these amazing events!',
  //         url: window.location.href
  //       });
  //     } catch (error) {
  //       console.log('Error sharing:', error);
  //     }
  //       } else {
  //     // Fallback: copy to clipboard
  //     await navigator.clipboard.writeText(window.location.href);
  //     toast.success('Page link copied to clipboard!');
  //   }
  // };

  // COMMENTED OUT: Clear all filters function for layout testing
  // const clearAllFilters = () => {
  //   setSearchInput('');
  //   setTagSearch('');
  //   setSelectedTag(null);
  //   setLocationFilter('');
  //   setDateRangeFilter({ startDate: '', endDate: '', enabled: false });
  //   setCapacityFilter({ min: '', max: '', enabled: false });
  //   setSortBy('date');
  //   toast.success('All filters cleared!');
  // };


    return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <EventsListSeo events={upcomingEvents} />
      {/* Header Section */}
      <motion.div 
        className="mb-6"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent leading-relaxed pb-1 mb-6">
            Events
          </h1>
          {/* COMMENTED OUT: Description text for layout testing */}
          {/* <p className="text-xl text-gray-600 max-w-3xl mx-auto">Join our community events and transform your fitness journey.</p> */}
          
          {/* COMMENTED OUT: Real-time status indicator for layout testing */}
          {/* {lastUpdate && (
            <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Live updates • Last updated {lastUpdate.toLocaleTimeString()}</span>
            </div>
          )} */}
        </div>
        
        {/* COMMENTED OUT: Right-side button container for layout testing */}
        {/* <div className="flex items-center gap-2 flex-shrink-0">
          {/* Mobile Filter Button */}
          {/* <button
            onClick={() => setShowMobileFilters(true)}
            className="md:hidden px-3 py-2 rounded-full border border-gray-300 text-gray-700 min-h-[44px] text-sm"
            aria-label="Open filters"
          >
            Filters
          </button> */}

          {/* Share button */}
          {/* <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={shareEventsPage}
            className="p-2 text-gray-600 hover:text-[#F25129] hover:bg-[#F25129]/10 rounded-full transition-all duration-200"
            title="Share Events Page"
          >
            <Share2 className="w-5 h-5" />
          </motion.button> */}

          {/* Action buttons (admin only) */}
          {/* {currentUser?.role === 'admin' && (
            <>
              
              <motion.button
                onClick={() => setShowModal(true)} 
                className="inline-flex items-center px-3 py-2 md:px-4 rounded-full bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white hover:from-[#E0451F] hover:to-[#E55A2A] hover:shadow-lg transition-all duration-200 min-h-[44px] text-sm md:text-base"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Plus className="w-4 h-4 mr-1 md:mr-2" /> 
                <span className="hidden sm:inline">Create Event</span>
                <span className="sm:hidden">Create</span>
              </motion.button>
            </>
          )}
        </div> */}
      </motion.div>

      {/* Tabs for Upcoming/Past Events */}
      <motion.div 
        className="flex border-b border-gray-200 mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <button
          onClick={() => setActiveTab('upcoming')}
                      className={`px-4 py-2 font-medium border-b-2 transition-all duration-200 ${
            activeTab === 'upcoming'
              ? 'border-[#F25129] text-[#F25129]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Upcoming Events
            {activeTab === 'upcoming' && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="bg-[#F25129]/10 text-[#F25129] text-xs px-2 py-1 rounded-full"
              >
                {filtered.length}
              </motion.span>
            )}
            </div>
        </button>
        <button
          onClick={() => setActiveTab('past')}
                      className={`px-4 py-2 font-medium border-b-2 transition-all duration-200 ${
            activeTab === 'past'
              ? 'border-[#F25129] text-[#F25129]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Past Events
            {activeTab === 'past' && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="bg-[#F25129]/10 text-[#F25129] text-xs px-2 py-1 rounded-full"
              >
                {filtered.length}
              </motion.span>
            )}
            </div>
        </button>
      </motion.div>

      {/* Desktop Search and Filter Controls */}
      <motion.div 
        className="hidden md:block sticky z-10 bg-white/95 backdrop-blur-sm
                   -mx-4 sm:-mx-6 lg:-mx-8
                   px-4  sm:px-6  lg:px-8
                   pt-2 mb-6"
        style={{ top: 'var(--app-header-offset, 64px)' } as React.CSSProperties}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        {/* Simplified Filters - Matching Media Page Design */}
        <div className="flex flex-row gap-2 mb-6 md:mb-8">
          {/* Search Input */}
          <div className="flex-1 relative min-w-0 max-w-xs">
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search events by title, location, or tags..."
              className="w-full px-3 py-1.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:ring-offset-1 focus:border-transparent bg-white text-sm placeholder-gray-400"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕
              </button>
            )}
          </div>

          {/* Date Range */}
          <div className="flex gap-1 flex-shrink-0">
            <input
              type="date"
              value={dateRangeFilter.startDate}
              onChange={e => {
                const startDate = e.target.value;
                setDateRangeFilter(prev => ({ 
                  ...prev, 
                  startDate,
                  enabled: startDate !== '' || prev.endDate !== ''
                }));
              }}
              className="px-2 py-1.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:ring-offset-1 focus:border-transparent bg-white text-sm"
            />
            <input
              type="date"
              value={dateRangeFilter.endDate}
              onChange={e => {
                const endDate = e.target.value;
                setDateRangeFilter(prev => ({ 
                  ...prev, 
                  endDate,
                  enabled: prev.startDate !== '' || endDate !== ''
                }));
              }}
              className="px-2 py-1.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:ring-offset-1 focus:border-transparent bg-white text-sm"
            />
          </div>

          {/* View Mode */}
          <button 
            onClick={() => setViewMode(viewMode === 'grid' ? 'calendar' : 'grid')} 
            className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-all duration-200 flex items-center gap-2 text-sm flex-shrink-0"
          >
            {viewMode === 'grid' ? <Calendar className="w-4 h-4" /> : <div className="w-4 h-4">⊞</div>}
            {viewMode === 'grid' ? 'Calendar' : 'Grid'}
          </button>

          {/* Sort Options */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="px-3 py-1.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:ring-offset-1 focus:border-transparent bg-white text-sm flex-shrink-0"
          >
            <option value="date">Date (Soonest)</option>
            <option value="title">Title (A-Z)</option>
            <option value="location">Location (A-Z)</option>
            <option value="popularity">Popularity</option>
          </select>
        </div>
      </motion.div>

      {/* Mobile Filter Sheet */}
      {showMobileFilters && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={()=>setShowMobileFilters(false)} />
          <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl p-4 max-h-[80vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Filters</h3>
              <button 
                className="px-3 py-1 rounded-lg border min-h-[44px]" 
                onClick={()=>setShowMobileFilters(false)}
              >
                Done
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Search Input */}
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-500 mb-1">Search</div>
                <label className="flex items-center min-h-[44px] rounded-xl border border-gray-300 px-3 bg-white">
                  <Search className="w-4 h-4 text-gray-400 mr-2" />
                  <input
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    placeholder="Search events by title, location, or tags…"
                    className="flex-1 outline-none bg-transparent min-w-0"
                  />
                  {searchInput && (
                    <button
                      onClick={() => setSearchInput('')}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Clear search"
                    >
                      ×
                    </button>
                  )}
                </label>
              </div>

              {/* Tag Search */}
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-500 mb-1">Tags</div>
                <div className="relative min-h-[44px]">
                  <input
                    type="text"
                    placeholder="Search tags..."
                    value={tagSearch}
                    onChange={e => setTagSearch(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200"
                  />
                  {selectedTag && (
                    <div className="absolute -top-2 -right-2 bg-[#F25129] text-white text-xs px-2 py-1 rounded-full">
                      {selectedTag}
                      <button
                        onClick={() => setSelectedTag(null)}
                        className="ml-1 hover:bg-[#d43d1a] rounded-full w-4 h-4 flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {/* Tag suggestions dropdown */}
                  {tagSearch && Array.isArray(filteredTags) && filteredTags.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                      {filteredTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => {
                            setSelectedTag(tag);
                            setTagSearch('');
                          }}
                          className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors duration-200"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* View Mode */}
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-500 mb-1">View</div>
                <button 
                  onClick={() => setViewMode(viewMode === 'grid' ? 'calendar' : 'grid')} 
                  className="w-full min-h-[44px] px-3 rounded-xl border border-gray-300 hover:bg-gray-50 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  {viewMode === 'grid' ? <Calendar className="w-4 h-4" /> : <div className="w-4 h-4">⊞</div>}
                  {viewMode === 'grid' ? 'Calendar View' : 'Grid View'}
                </button>
              </div>

              {/* Advanced Filters Toggle */}
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-500 mb-1">Advanced Filters</div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={`w-full min-h-[44px] px-3 rounded-xl border transition-all duration-200 flex items-center justify-center gap-2 ${
                    showAdvancedFilters 
                      ? 'bg-[#F25129]/10 text-[#F25129] border-[#F25129]/30' 
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  {showAdvancedFilters ? 'Hide Advanced' : 'Show Advanced'}
                </motion.button>
              </div>

              {/* Advanced Filters Panel */}
              <AnimatePresence>
                {showAdvancedFilters && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="bg-gray-50 rounded-lg p-4 space-y-4"
                  >
                    <div className="space-y-4">
                      {/* Location Filter */}
                      <div className="min-w-0">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
                        <input
                          type="text"
                          value={locationFilter}
                          onChange={e => setLocationFilter(e.target.value)}
                          placeholder="Filter by location..."
                          className="w-full min-h-[44px] px-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                        />
                      </div>

                      {/* Date Range Filter */}
                      <div className="min-w-0">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Date Range</label>
                        <div className="space-y-2">
                          <input
                            type="date"
                            value={dateRangeFilter.startDate}
                            onChange={e => {
                              const startDate = e.target.value;
                              setDateRangeFilter(prev => ({ 
                                ...prev, 
                                startDate,
                                enabled: startDate !== '' || prev.endDate !== ''
                              }));
                            }}
                            className="w-full min-h-[44px] px-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                          />
                          <input
                            type="date"
                            value={dateRangeFilter.endDate}
                            onChange={e => {
                              const endDate = e.target.value;
                              setDateRangeFilter(prev => ({ 
                                ...prev, 
                                endDate,
                                enabled: prev.startDate !== '' || endDate !== ''
                              }));
                            }}
                            className="w-full min-h-[44px] px-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                          />
                        </div>
                      </div>

                      {/* Capacity Filter */}
                      <div className="min-w-0">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Capacity</label>
                        <div className="space-y-2">
                          <input
                            type="number"
                            placeholder="Min"
                            value={capacityFilter.min}
                            onChange={e => setCapacityFilter(prev => ({ ...prev, min: e.target.value }))}
                            className="w-full min-h-[44px] px-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                          />
                          <input
                            type="number"
                            placeholder="Max"
                            value={capacityFilter.max}
                            onChange={e => setCapacityFilter(prev => ({ ...prev, max: e.target.value }))}
                            className="w-full min-h-[44px] px-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                          />
                        </div>
                      </div>

                      {/* Sort Options */}
                      <div className="min-w-0">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Sort By</label>
                        <select
                          value={sortBy}
                          onChange={e => setSortBy(e.target.value as any)}
                          className="w-full min-h-[44px] px-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                        >
                          <option value="date">Date (Soonest)</option>
                          <option value="title">Title (A-Z)</option>
                          <option value="location">Location (A-Z)</option>
                          <option value="popularity">Popularity</option>
                        </select>
                      </div>
                    </div>

                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}



      {/* Events Display */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        {viewMode === 'grid' ? (
          <>
            {/* Past events are always visible to everyone, regardless of original visibility */}
            {activeTab === 'past' ? (
              <EventList events={filtered} loading={loading} emptyText="No past events yet." />
            ) : currentUser ? (
              <EventList events={filtered} loading={loading} emptyText="No events yet." />
            ) : (
              <EventList events={filtered.filter(e => e.visibility === 'public')} loading={loading} emptyText="No public events yet." />
            )}
          </>
        ) : (
          <EventCalendar events={filtered} onSelect={onSelectCalEvent} />
        )}
      </motion.div>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mt-6 rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              {error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Event Form Modal */}
      <AnimatePresence>
        {showModal && (
        <CreateEventModal
            onClose={() => setShowModal(false)} 
            onEventCreated={() => setShowModal(false)} 
          />
        )}
      </AnimatePresence>

      {/* RSVP Modal */}
      <AnimatePresence>
        {showRSVPModal && selectedEvent && (
          <RSVPModal
            event={selectedEvent}
            onClose={() => setShowRSVPModal(false)}
            onAttendeeUpdate={() => {
              console.log('RSVP Updated from calendar');
              setShowRSVPModal(false);
              setSelectedEvent(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Event Teaser Modal */}
      <AnimatePresence>
        {showTeaserModal && selectedEvent && (
          <EventTeaserModal
            open={showTeaserModal}
                event={selectedEvent} 
            onClose={() => setShowTeaserModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Past Event Modal */}
      <AnimatePresence>
        {showPastEventModal && selectedPastEvent && (
          <PastEventModal
            open={showPastEventModal}
            event={selectedPastEvent}
            onClose={() => setShowPastEventModal(false)}
          />
        )}
      </AnimatePresence>

    </div>
  );
};

export default Events;
