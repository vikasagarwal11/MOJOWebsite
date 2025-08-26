
import React, { useMemo, useState } from 'react';
import { useEvents } from './hooks/useEvents';
import EventList from './components/EventList';
import EventCalendar from './components/EventCalendar';
import EventFormModal from './components/EventFormModal';
import { useAuth } from '@/contexts/AuthContext';
import { Calendar, Plus } from 'lucide-react';
import toast from 'react-hot-toast';

const EventsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { upcomingEvents, pastEvents, upcomingTeasers, loading, error } = useEvents({ includeGuestTeasers: true });

  const [activeTab, setActiveTab] = useState<'upcoming'|'past'>('upcoming');
  const [viewMode, setViewMode] = useState<'grid'|'calendar'>('grid');
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState<string| null>(null);

  const baseList = activeTab === 'upcoming' ? upcomingEvents : pastEvents;

  const allTags = useMemo(() => [...new Set(baseList.flatMap(e => e.tags || []))], [baseList]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = baseList.filter(e => {
      const okTitle = q ? (e.title || '').toLowerCase().includes(q) : true;
      const okTag = tag ? (e.tags || []).includes(tag) : true;
      return okTitle && okTag;
    });
    const map = new Map(list.map(e => [e.id, e]));
    return Array.from(map.values());
  }, [baseList, search, tag]);

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
        {currentUser && (
          <button onClick={() => setShowModal(true)} className="inline-flex items-center px-4 py-2 rounded-full bg-purple-600 text-white hover:bg-purple-700">
            <Plus className="w-4 h-4 mr-2" /> Create Event
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 relative">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events by title…" className="w-full px-4 py-2 rounded border" />
          <Calendar className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
        </div>
        <select value={tag || ''} onChange={e => setTag(e.target.value || null)} className="px-4 py-2 rounded border">
          <option value="">All Tags</option>
          {allTags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={() => setViewMode(viewMode === 'grid' ? 'calendar' : 'grid')} className="px-4 py-2 rounded border">
          {viewMode === 'grid' ? 'Calendar View' : 'Grid View'}
        </button>
      </div>

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

export default EventsPage;
