
import React, { useMemo, useState } from 'react';
import { useEvents } from './hooks/useEvents';
import EventList from './components/EventList';
import EventCalendar from './components/EventCalendar';
import EventFormModal from './components/EventFormModal';
import RSVPModal from './components/RSVPModal';
import EventTeaserModal from './components/EventTeaserModal';
import { useAuth } from '@/contexts/AuthContext';
import { Calendar, X } from 'lucide-react';

const EventsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { upcomingEvents, pastEvents, upcomingTeasers, loading, error } = useEvents({ includeGuestTeasers: true });

  const [activeTab, setActiveTab] = useState<'upcoming'|'past'>('upcoming');
  const [viewMode, setViewMode] = useState<'grid'|'calendar'>('grid');
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState<string| null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showRSVP, setShowRSVP] = useState(false);
  const [showTeaser, setShowTeaser] = useState(false);

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

  function onSelectEvent(e:any){
    setSelectedEvent(e);
    if (!currentUser && e.visibility !== 'public' && activeTab !== 'past') {
      setShowTeaser(true);
    } else {
      setShowRSVP(true);
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Fitness Events</h1>
          <p className="text-gray-600">Join our community events and transform your fitness journey.</p>
        </div>
        <div className="flex gap-2">
          {currentUser && (
            <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-full bg-purple-600 text-white hover:bg-purple-700">
              Create Event
            </button>
          )}
        </div>
      </div>

      {/* sticky filters */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b py-3 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search events by title…"
              className="w-full px-4 py-2 rounded border" />
            <Calendar className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
          </div>
          <select value={tag || ''} onChange={e=>setTag(e.target.value || null)} className="px-4 py-2 rounded border">
            <option value="">All Tags</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={()=>setActiveTab('upcoming')} className={`px-3 py-2 rounded border ${activeTab==='upcoming'?'bg-purple-50 border-purple-200 text-purple-700':''}`}>Upcoming</button>
            <button onClick={()=>setActiveTab('past')} className={`px-3 py-2 rounded border ${activeTab==='past'?'bg-purple-50 border-purple-200 text-purple-700':''}`}>Past</button>
            <button onClick={()=>setViewMode(viewMode==='grid'?'calendar':'grid')} className="px-3 py-2 rounded border">
              {viewMode==='grid'?'Calendar View':'Grid View'}
            </button>
            {viewMode==='calendar' && (
              <button onClick={()=>window.location.reload()} className="px-3 py-2 rounded border">Today</button>
            )}
          </div>
        </div>

        {/* active filter chips */}
        {(search || tag) && (
          <div className="flex gap-2 mt-2">
            {search && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs border border-blue-200">
                “{search}”
                <button className="p-0.5" onClick={()=>setSearch('')}><X className="w-3 h-3" /></button>
              </span>
            )}
            {tag && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs border border-blue-200">
                {tag}
                <button className="p-0.5" onClick={()=>setTag(null)}><X className="w-3 h-3" /></button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* body */}
      {viewMode === 'grid'
        ? (
          currentUser
            ? <EventList events={filtered} loading={loading} emptyText="No events yet." onClick={onSelectEvent} />
            : <>
                <h3 className="text-lg font-semibold mb-2">Upcoming (public)</h3>
                <EventList events={filtered.filter(e=>e.visibility==='public')} loading={loading} emptyText="No public events yet." onClick={onSelectEvent} />
              </>
        )
        : <EventCalendar events={filtered} onSelect={onSelectEvent} />
      }

      {error && <div className="mt-6 rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2">{error}</div>}

      {showModal && <EventFormModal onClose={()=>setShowModal(false)} />}

      <RSVPModal open={showRSVP} event={selectedEvent} onClose={()=>setShowRSVP(false)} quickEnabled={false} />
      <EventTeaserModal open={showTeaser} onClose={()=>setShowTeaser(false)} title={selectedEvent?.title || 'Members only'} />
    </div>
  );
};

export default EventsPage;
