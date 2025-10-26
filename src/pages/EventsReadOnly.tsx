import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, Calendar, TrendingUp } from 'lucide-react';
import { useEvents } from '../hooks/useEvents';
import { EventCardReadOnly } from '../components/events/EventCardReadOnly';
import { useDebounce } from 'use-debounce';

// Helper function for consistent date handling across formats
function eventStartToDate(e: any): Date | null {
  try {
    if (e?.startAt?.toDate && typeof e.startAt.toDate === 'function') return e.startAt.toDate(); // Firestore Timestamp
    if (typeof e?.startAt?.seconds === 'number') {
      return new Date(e.startAt.seconds * 1000 + (e.startAt.nanoseconds || 0) / 1e6);
    }
    if (e?.startAt instanceof Date) return e.startAt;
    if (typeof e?.startAt === 'number') return new Date(e.startAt);
    if (typeof e?.startAt === 'string') {
      const d = new Date(e.startAt);
      return isNaN(d.getTime()) ? null : d;
    }
  } catch {}
  return null;
}

// Helper function for safe string operations
const s = (x?: string) => (x ?? '').toLowerCase();

const EventsReadOnly: React.FC = () => {
  const { upcomingEvents, pastEvents, loading, error } = useEvents({ includeGuestTeasers: true });

  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [viewMode, setViewMode] = useState<'grid'|'calendar'>('grid');
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

  // Debounce search input
  const [debouncedSearchInput] = useDebounce(searchInput, 300);

  // Use the same base list logic as original Events page
  const baseList = useMemo(() => {
    return activeTab === 'upcoming' ? upcomingEvents : pastEvents;
  }, [upcomingEvents, pastEvents, activeTab]);

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

  // Advanced filtering and sorting - improved with helper functions
  const filtered = useMemo(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('🔍 EventsReadOnly.tsx - filtered useMemo called with baseList:', {
        baseListType: typeof baseList,
        baseListIsArray: Array.isArray(baseList),
        baseListLength: Array.isArray(baseList) ? baseList.length : 'N/A'
      });
    }
    
    if (!Array.isArray(baseList)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('🚨 EventsReadOnly.tsx - baseList is not an array in filtered useMemo:', {
          baseList,
          type: typeof baseList,
          constructor: baseList?.constructor?.name
        });
      }
      return [];
    }
    
    let list = baseList.filter(e => {
      // Filter for read-only events first
      if (e.isReadOnly !== true) return false;
      
      // Basic search filter
      const q = debouncedSearchInput.trim().toLowerCase();
      const okTag = selectedTag ? (e.tags || []).includes(selectedTag) : true;
      
      // Search in title, location, venue name, venue address, and tags - using safe string helper
      const okSearch = q ? (
        s(e.title).includes(q) ||
        s(e.location).includes(q) ||
        s(e.venueName).includes(q) ||
        s(e.venueAddress).includes(q) ||
        (e.tags || []).some(tag => s(tag).includes(q))
      ) : true;
      
      if (!okSearch || !okTag) return false;

      // Location filter - using safe string helper
      if (locationFilter) {
        const locationMatch = (
          s(e.location).includes(s(locationFilter)) ||
          s(e.venueName).includes(s(locationFilter)) ||
          s(e.venueAddress).includes(s(locationFilter))
        );
        if (!locationMatch) return false;
      }

      // Date range filter - using consistent date helper
      if (dateRangeFilter.enabled && (dateRangeFilter.startDate || dateRangeFilter.endDate)) {
        const eventDate = eventStartToDate(e);
        if (!eventDate) return false;
        
        if (dateRangeFilter.startDate) {
          const startDate = new Date(dateRangeFilter.startDate);
          if (eventDate < startDate) return false;
        }
        
        if (dateRangeFilter.endDate) {
          const endDate = new Date(dateRangeFilter.endDate);
          if (eventDate > endDate) return false;
        }
      }

      // Capacity filter - improved numeric handling
      if (capacityFilter.enabled) {
        const cap = typeof e.maxAttendees === 'string' ? parseInt(e.maxAttendees, 10) : e.maxAttendees ?? 0;
        if (Number.isFinite(cap)) {
          const min = capacityFilter.min ? parseInt(capacityFilter.min, 10) : 0;
          const max = capacityFilter.max ? parseInt(capacityFilter.max, 10) : Infinity;
          if (cap < min || cap > max) return false;
        }
      }

      return true;
    });

    // Remove duplicates and sort
    const map = new Map(Array.isArray(list) ? list.map(e => [e.id, e]) : []);
    list = Array.from(map.values());

    // Non-mutating sort for safety
    const sorted = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return s(a.title).localeCompare(s(b.title));
        case 'location':
          // Sort by venue name first, then location, then venue address
          const aLocation = s(a.venueName || a.location || a.venueAddress);
          const bLocation = s(b.venueName || b.location || b.venueAddress);
          return aLocation.localeCompare(bLocation);
        case 'popularity':
          // Sort by maxAttendees (higher capacity = more popular)
          const aCap = typeof a.maxAttendees === 'string' ? parseInt(a.maxAttendees, 10) : a.maxAttendees ?? 0;
          const bCap = typeof b.maxAttendees === 'string' ? parseInt(b.maxAttendees, 10) : b.maxAttendees ?? 0;
          return bCap - aCap;
        case 'date':
        default:
          // Safe comparison using consistent date helper
          const aDate = eventStartToDate(a)?.getTime() ?? 0;
          const bDate = eventStartToDate(b)?.getTime() ?? 0;
          return aDate - bDate;
      }
    });

    return sorted;
  }, [baseList, debouncedSearchInput, selectedTag, locationFilter, dateRangeFilter, capacityFilter, sortBy]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F25129] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading read-only events...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <div className="text-red-600 text-lg font-semibold">Error loading events</div>
          <p className="mt-2 text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Section */}
      <motion.div 
        className="mb-6"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent leading-relaxed pb-1 mb-6">
            MFM Events
          </h1>
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
          aria-pressed={activeTab === 'upcoming'}
          aria-label="View upcoming events"
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
          aria-pressed={activeTab === 'past'}
          aria-label="View past events"
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

      {/* Desktop Search and Filter Controls - EXACT COPY FROM ORIGINAL EVENTS PAGE */}
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
              aria-label="Search events"
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
                  aria-expanded={showAdvancedFilters}
                  aria-label={showAdvancedFilters ? 'Hide advanced filters' : 'Show advanced filters'}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <div className="text-gray-400 text-lg font-medium mb-2">No read-only events found</div>
                <p className="text-gray-500 text-sm">
                  {activeTab === 'upcoming' 
                    ? 'No upcoming read-only events match your filters.' 
                    : 'No past read-only events match your filters.'
                  }
                </p>
              </div>
            ) : (
              filtered.map((event) => (
                <EventCardReadOnly key={event.id} event={event} />
              ))
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg font-medium mb-2">Calendar view coming soon</div>
            <p className="text-gray-500 text-sm">Calendar view is not yet available for read-only events.</p>
            <button
              onClick={() => setViewMode('grid')}
              className="mt-4 px-4 py-2 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] transition-colors"
            >
              Switch to Grid View
            </button>
          </div>
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
    </div>
  );
};

export default EventsReadOnly;