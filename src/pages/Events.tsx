import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, Calendar, Share2, Plus, X, TrendingUp, Clock, MapPin, Users, Tag } from 'lucide-react';
import EventCalendar from '../components/events/EventCalendar';
import EventList from '../components/events/EventList';
import CreateEventModal from '../components/events/CreateEventModal';
import { useEvents } from '../hooks/useEvents';
import { useRealTimeEvents } from '../hooks/useRealTimeEvents';
import { useAuth } from '../contexts/AuthContext';
import { useUserBlocking } from '../hooks/useUserBlocking';
import { EventDoc } from '../hooks/useEvents';
import { RSVPModalNew as RSVPModal } from '../components/events/RSVPModalNew';
import { EventTeaserModal } from '../components/events/EventTeaserModal';
import { PastEventModal } from '../components/events/PastEventModal';
import toast from 'react-hot-toast';
import { useDebounce } from 'use-debounce';

const Events: React.FC = () => {
  const { currentUser } = useAuth();
  const { upcomingEvents, pastEvents, loading, error } = useEvents({ includeGuestTeasers: true });
  
  // Real-time updates
  const { 
    events: realTimeEvents, 
    lastUpdate, 
    refreshEvents: refreshRealTime 
  } = useRealTimeEvents({
    enableNotifications: true,
    enableRealTimeUpdates: true,
    userId: currentUser?.id
  });

  const [activeTab, setActiveTab] = useState<'upcoming'|'past'>('upcoming');
  const [viewMode, setViewMode] = useState<'grid'|'calendar'>('grid');
  const [showModal, setShowModal] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
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
      pastEvents: pastEvents.map(e => ({ id: e.id, title: e.title, startAt: e.startAt }))
    });
  }, [activeTab, upcomingEvents, pastEvents, realTimeEvents, baseList]);

  const allTags = useMemo(() => [...new Set(baseList.flatMap(e => e.tags || []))], [baseList]);
  
  // Filter tags based on search input
  const filteredTags = useMemo(() => {
    if (!tagSearch.trim()) return allTags.slice(0, 10); // Show top 10 tags when no search
    return allTags.filter(tag => 
      tag.toLowerCase().includes(tagSearch.toLowerCase())
    ).slice(0, 10); // Limit to 10 results
  }, [allTags, tagSearch]);

  const { blockedUsers } = useUserBlocking();

  // Advanced filtering and sorting
  const filtered = useMemo(() => {
    let list = baseList.filter(e => {
      // Basic search filter
      const q = debouncedSearch.trim().toLowerCase();
      const okTitle = q ? (e.title || '').toLowerCase().includes(q) : true;
      const okTag = selectedTag ? (e.tags || []).includes(selectedTag) : true;
      
      // Search in title, location, venue name, and venue address
      const okSearch = q ? (
        (e.title || '').toLowerCase().includes(q) ||
        (e.location || '').toLowerCase().includes(q) ||
        (e.venueName || '').toLowerCase().includes(q) ||
        (e.venueAddress || '').toLowerCase().includes(q)
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
      if (dateRangeFilter.enabled && dateRangeFilter.startDate && dateRangeFilter.endDate) {
        const eventDate = new Date(e.startAt.seconds * 1000);
        const startDate = new Date(dateRangeFilter.startDate);
        const endDate = new Date(dateRangeFilter.endDate);
        
        if (eventDate < startDate || eventDate > endDate) return false;
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
    const map = new Map(list.map(e => [e.id, e]));
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
          return a.startAt.seconds - b.startAt.seconds;
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

    // Check if user is blocked from RSVP
    const isBlockedFromRSVP = blockedUsers.some((block: any) => 
      block.blockCategory === 'rsvp_only' && block.isActive
    );

    // Check if event is past
    const isEventPast = () => {
      if (!e.startAt) return false;
      const eventDate = e.startAt.toDate ? e.startAt.toDate() : new Date(e.startAt);
      return eventDate < new Date();
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
      console.log('🔍 Opening RSVPModal for authenticated user from calendar');
      setSelectedEvent(e);
      setShowRSVPModal(true);
    }
  };



  // Share current events page
  const shareEventsPage = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Fitness Events',
          text: 'Check out these amazing fitness events!',
          url: window.location.href
        });
      } catch (error) {
        console.log('Error sharing:', error);
      }
        } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Page link copied to clipboard!');
    }
  };

  // Clear all filters
  const clearAllFilters = () => {
    setSearchInput('');
    setTagSearch('');
    setSelectedTag(null);
    setLocationFilter('');
    setDateRangeFilter({ startDate: '', endDate: '', enabled: false });
    setCapacityFilter({ min: '', max: '', enabled: false });
    setSortBy('date');
    toast.success('All filters cleared!');
  };

  // Check if any filters are active
  const hasActiveFilters = searchInput || selectedTag || locationFilter || 
    dateRangeFilter.enabled || capacityFilter.enabled || sortBy !== 'date';

    return (
    <div className="max-w-7xl mx-auto p-6 pb-32">
      {/* Header Section */}
      <motion.div 
        className="flex items-start justify-between mb-6"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#F25129] to-[#FF6B35] bg-clip-text text-transparent leading-relaxed pb-1">
            Fitness Events
          </h1>
          <p className="text-gray-600">Join our community events and transform your fitness journey.</p>
          
          {/* Real-time status indicator */}
          {lastUpdate && (
            <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Live updates • Last updated {lastUpdate.toLocaleTimeString()}</span>
          </div>
        )}
          </div>
        
        <div className="flex items-center gap-3">
          {/* Share button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={shareEventsPage}
            className="p-2 text-gray-600 hover:text-[#F25129] hover:bg-[#F25129]/10 rounded-full transition-all duration-200"
            title="Share Events Page"
          >
            <Share2 className="w-5 h-5" />
          </motion.button>



          {/* Create Event button (admin only) */}
          {currentUser?.role === 'admin' && (
            <motion.button 
              onClick={() => setShowModal(true)} 
              className="inline-flex items-center px-4 py-2 rounded-full bg-gradient-to-r from-[#F25129] to-[#FF6B35] text-white hover:from-[#E0451F] hover:to-[#E55A2A] hover:shadow-lg transition-all duration-200"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Plus className="w-4 h-4 mr-2" /> Create Event
            </motion.button>
          )}
        </div>
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

      {/* Search and Filter Controls */}
      <motion.div 
        className="space-y-4 mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        {/* Main Search and View Controls */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search events by title, location, or tags…"
              className="w-full px-4 py-2 rounded-lg border pr-10 focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {searchInput && (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setSearchInput('')}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Clear search"
                >
                  ×
                </motion.button>
              )}
              <Search className="w-4 h-4 text-gray-400" />
          </div>
        </div>
          
          <div className="relative">
            <input
              type="text"
              placeholder="Search tags..."
              value={tagSearch}
              onChange={e => setTagSearch(e.target.value)}
              className="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200 w-48"
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
            {tagSearch && filteredTags.length > 0 && (
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
          
          <button 
            onClick={() => setViewMode(viewMode === 'grid' ? 'calendar' : 'grid')} 
            className="px-4 py-2 rounded-lg border hover:bg-gray-50 transition-all duration-200 flex items-center gap-2"
          >
            {viewMode === 'grid' ? <Calendar className="w-4 h-4" /> : <div className="w-4 h-4">⊞</div>}
            {viewMode === 'grid' ? 'Calendar View' : 'Grid View'}
          </button>

          {/* Advanced Filters Toggle */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`px-4 py-2 rounded-lg border transition-all duration-200 flex items-center gap-2 ${
              showAdvancedFilters 
                ? 'bg-[#F25129]/10 text-[#F25129] border-[#F25129]/30' 
                : 'hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Advanced
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Location Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                  <input
                    type="text"
                    value={locationFilter}
                    onChange={e => setLocationFilter(e.target.value)}
                    placeholder="Filter by location..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
         />
      </div>

                {/* Date Range Filter */}
        <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={dateRangeFilter.startDate}
                      onChange={e => setDateRangeFilter(prev => ({ ...prev, startDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                    />
                    <input
                      type="date"
                      value={dateRangeFilter.endDate}
                      onChange={e => setDateRangeFilter(prev => ({ ...prev, endDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                    />
        </div>
      </div>

                {/* Capacity Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Capacity</label>
                  <div className="space-y-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={capacityFilter.min}
                      onChange={e => setCapacityFilter(prev => ({ ...prev, min: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                    />
          <input
                      type="number"
                      placeholder="Max"
                      value={capacityFilter.max}
                      onChange={e => setCapacityFilter(prev => ({ ...prev, max: e.target.value }))}
                      className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                    />
            </div>
        </div>

                {/* Sort Options */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
        <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                  >
                    <option value="date">Date (Soonest)</option>
                    <option value="title">Title (A-Z)</option>
                    <option value="location">Location (A-Z)</option>
                    <option value="popularity">Popularity</option>
        </select>
      </div>
              </div>

              {/* Filter Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <span className="text-sm text-gray-600">
                  {hasActiveFilters ? `${filtered.length} events found` : 'All events shown'}
                </span>
                <div className="flex gap-2">
          <button
                    onClick={clearAllFilters}
                    className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 underline"
                  >
                    Clear all filters
          </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Search Status and Tag Statistics */}
      <AnimatePresence>
        {(debouncedSearch || selectedTag || hasActiveFilters) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-6 p-4 bg-gradient-to-r from-[#F25129]/10 to-[#FF6B35]/10 border border-[#F25129]/20 rounded-lg"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-[#F25129]" />
                <span className="text-sm font-medium text-[#F25129]">
                  {debouncedSearch && `Searching for "${debouncedSearch}"`}
                  {debouncedSearch && selectedTag && ' • '}
                  {selectedTag && `Filtered by tag "${selectedTag}"`}
                  {hasActiveFilters && ' • Advanced filters applied'}
                </span>
        </div>
        <button
                onClick={clearAllFilters}
                className="text-sm text-[#F25129] hover:text-[#E0451F] underline"
        >
                Clear all filters
        </button>
      </div>
            {filtered.length > 0 && (
                              <div className="mt-2 text-sm text-[#F25129]">
                Found {filtered.length} event{filtered.length !== 1 ? 's' : ''}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tag Statistics and Quick Filters */}
      {allTags.length > 0 && (
        <motion.div 
          className="mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <h3 className="text-sm font-medium text-gray-700 mb-3">Popular Tags:</h3>
          <div className="flex flex-wrap gap-2">
            {allTags.slice(0, 10).map(tagName => (
              <motion.button
                key={tagName}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedTag(selectedTag === tagName ? null : tagName)}
                className={`px-3 py-1 text-sm rounded-full border transition-all duration-200 ${
                  selectedTag === tagName
                    ? 'bg-[#F25129] text-white border-[#F25129] shadow-lg'
                    : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100 hover:border-gray-400'
                }`}
              >
                <Tag className="w-3 h-3 inline mr-1" />
                {tagName}
              </motion.button>
            ))}
            {allTags.length > 10 && (
              <span className="px-3 py-1 text-sm text-gray-500">
                +{allTags.length - 10} more
              </span>
            )}
          </div>
        </motion.div>
      )}

      {/* Events Display */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        {viewMode === 'grid' ? (
          <>
            {currentUser ? (
              <EventList events={filtered} loading={loading} emptyText="No events yet." />
            ) : (
              <>
                <h3 className="text-lg font-semibold mb-2">Upcoming (public)</h3>
                <EventList events={filtered.filter(e => e.visibility === 'public')} loading={loading} emptyText="No public events yet." />
              </>
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
