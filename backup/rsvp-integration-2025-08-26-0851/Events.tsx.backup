import React, { useMemo, useState } from 'react';
import { useEvents } from '../hooks/useEvents';
import EventList from '../components/events/EventList';
import EventCalendar from '../components/events/EventCalendar';
import EventFormModal from '../components/events/EventFormModal';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDebounce } from 'use-debounce';

const Events: React.FC = () => {
  const { currentUser } = useAuth();
  const { upcomingEvents, pastEvents, upcomingTeasers, loading, error } = useEvents({ includeGuestTeasers: true });

  const [activeTab, setActiveTab] = useState<'upcoming'|'past'>('upcoming');
  const [viewMode, setViewMode] = useState<'grid'|'calendar'>('grid');
  const [showModal, setShowModal] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [tag, setTag] = useState<string| null>(null);

  // Debounce search input - only search after user stops typing for 300ms
  const [debouncedSearch] = useDebounce(searchInput, 300);

  const baseList = activeTab === 'upcoming' ? upcomingEvents : pastEvents;

  const allTags = useMemo(() => [...new Set(baseList.flatMap(e => e.tags || []))], [baseList]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const list = baseList.filter(e => {
      const okTitle = q ? (e.title || '').toLowerCase().includes(q) : true;
      const okTag = tag ? (e.tags || []).includes(tag) : true;
      return okTitle && okTag;
    });
    const map = new Map(list.map(e => [e.id, e]));
    return Array.from(map.values());
  }, [baseList, debouncedSearch, tag]);

  const onSelectCalEvent = (e: any) => {
    if (!currentUser && e.visibility !== 'public' && activeTab !== 'past') {
      toast.error('Sign in to view event details.');
      return;
    }
    // TODO: open details modal/drawer
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Fitness Events</h1>
          <p className="text-gray-600">Join our community events and transform your fitness journey.</p>
        </div>
                 {currentUser?.role === 'admin' && (
           <button onClick={() => setShowModal(true)} className="inline-flex items-center px-4 py-2 rounded-full bg-purple-600 text-white hover:bg-purple-700">
             <Plus className="w-4 h-4 mr-2" /> Create Event
           </button>
         )}
      </div>

      {/* Tabs for Upcoming/Past Events */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'upcoming'
              ? 'border-purple-500 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Upcoming Events
        </button>
        <button
          onClick={() => setActiveTab('past')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'past'
              ? 'border-purple-500 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Past Events
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 relative">
          <input 
            value={searchInput} 
            onChange={e => setSearchInput(e.target.value)} 
            placeholder="Search events by title…" 
            className="w-full px-4 py-2 rounded border pr-10" 
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                title="Clear search"
              >
                ×
              </button>
            )}
            <Search className="w-4 h-4 text-gray-400" />
          </div>
        </div>
        <select value={tag || ''} onChange={e => setTag(e.target.value || null)} className="px-4 py-2 rounded border">
          <option value="">All Tags</option>
          {allTags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={() => setViewMode(viewMode === 'grid' ? 'calendar' : 'grid')} className="px-4 py-2 rounded border">
          {viewMode === 'grid' ? 'Calendar View' : 'Grid View'}
        </button>
      </div>
      
      {/* Search Status and Tag Statistics */}
      {(debouncedSearch || tag) && (
        <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">
                {debouncedSearch && `Searching for "${debouncedSearch}"`}
                {debouncedSearch && tag && ' • '}
                {tag && `Filtered by tag "${tag}"`}
              </span>
            </div>
            <button
              onClick={() => {
                setSearchInput('');
                setTag(null);
              }}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Clear all filters
            </button>
          </div>
          {filtered.length > 0 && (
            <div className="mt-2 text-sm text-blue-700">
              Found {filtered.length} event{filtered.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* Tag Statistics and Quick Filters */}
      {allTags.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Popular Tags:</h3>
          <div className="flex flex-wrap gap-2">
            {allTags.slice(0, 10).map(tagName => (
              <button
                key={tagName}
                onClick={() => setTag(tag === tagName ? null : tagName)}
                className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                  tag === tagName
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'
                }`}
              >
                {tagName}
              </button>
            ))}
            {allTags.length > 10 && (
              <span className="px-3 py-1 text-sm text-gray-500">
                +{allTags.length - 10} more
              </span>
            )}
          </div>
        </div>
      )}

      {viewMode === 'grid' ? (
        <>
          {currentUser ? (
            <EventList events={filtered} loading={loading} emptyText="No events yet." />
          ) : (
            <>
              <h3 className="text-lg font-semibold mb-2">Upcoming (public)</h3>
              <EventList events={filtered.filter(e => e.visibility === 'public')} loading={loading} emptyText="No public events yet." />
              {!!upcomingTeasers.length && (
                <>
                  <h3 className="text-lg font-semibold mt-6 mb-2">A peek at what members see</h3>
                  <EventList events={upcomingTeasers} loading={false} />
                </>
              )}
            </>
          )}
        </>
      ) : (
        <EventCalendar events={filtered} onSelect={onSelectCalEvent} />
      )}

      {error && <div className="mt-6 rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2">{error}</div>}

      {showModal && <EventFormModal onClose={() => setShowModal(false)} />}
    </div>
  );
};

export default Events;
