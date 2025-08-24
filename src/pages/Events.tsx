// Events: members see all; guests see public upcoming + teasers; past (public only for guests)
import React, { useEffect, useState, useMemo } from 'react';
import { Calendar, Plus } from 'lucide-react';
import { collection, onSnapshot, orderBy, query, where, Timestamp, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import EventCard from '../components/events/EventCard';
import CreateEventModal from '../components/events/CreateEventModal';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import { format } from 'date-fns/format';
import { parse } from 'date-fns/parse';
import { startOfWeek } from 'date-fns/startOfWeek';
import { getDay } from 'date-fns/getDay';
import { enUS } from 'date-fns/locale/en-US';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import toast from 'react-hot-toast';
import { usePopperTooltip } from 'react-popper-tooltip';
import 'react-popper-tooltip/dist/styles.css';

// Custom styles for calendar tooltips
const calendarTooltipStyles = `
  .tooltip-container {
    z-index: 9999 !important;
    position: absolute !important;
    pointer-events: none;
  }
  
  .rbc-calendar {
    overflow: visible !important;
  }
  
  .rbc-month-view,
  .rbc-week-view,
  .rbc-day-view {
    overflow: visible !important;
  }
  
  .rbc-event {
    position: relative;
    z-index: 1;
  }
`;

// Configure date-fns for react-big-calendar
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { 'en-US': enUS },
});

type AnyEvent = any;
type Teaser = { id: string; title: string; startAt: Timestamp | Date | { toDate: () => Date } };

function tsToDate(v: any): Date {
  if (!v) return new Date();
  if (typeof v?.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'string') return new Date(v);
  return new Date(v);
}

const Events: React.FC = () => {
  // Inject custom calendar tooltip styles
  React.useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = calendarTooltipStyles;
    document.head.appendChild(styleElement);
    
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  const { currentUser, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [viewMode, setViewMode] = useState<'grid' | 'calendar'>('grid');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<AnyEvent | null>(null);
  const [eventToEdit, setEventToEdit] = useState<AnyEvent | null>(null);
  const [eventMedia, setEventMedia] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<AnyEvent[]>([]); // members only
  const [publicUpcoming, setPublicUpcoming] = useState<AnyEvent[]>([]); // guests
  const [upcomingTeasers, setUpcomingTeasers] = useState<Teaser[]>([]);
  const [past, setPast] = useState<AnyEvent[]>([]); // for guests: public only
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);
  const [loadingPublicUpcoming, setLoadingPublicUpcoming] = useState(false);
  const [loadingPast, setLoadingPast] = useState(true);
  const [loadingTeasers, setLoadingTeasers] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleEditEvent = (event: AnyEvent) => {
    setEventToEdit(event);
    setIsCreateModalOpen(true);
  };

  // Fetch events (same as original)
  useEffect(() => {
    if (authLoading) return;
    setErr(null);
    const eventsRef = collection(db, 'events');
    const teasersRef = collection(db, 'event_teasers');
    const SKEW_MS = 2 * 60 * 1000;
    const nowClientMs = Date.now();
    const pastCutoff = Timestamp.fromMillis(nowClientMs - SKEW_MS);
    const nowTs = Timestamp.fromMillis(nowClientMs);

    // Past events
    let unsubPast: () => void;
    if (currentUser) {
      const pastQ = query(eventsRef, where('startAt', '<', pastCutoff), orderBy('startAt', 'desc'));
      unsubPast = onSnapshot(
        pastQ,
        (snap) => { setPast(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingPast(false); },
        (e) => { console.error(e); setErr('Failed to load past events.'); setLoadingPast(false); }
      );
    } else {
      const pastQ = query(
        eventsRef,
        where('visibility', '==', 'public'),
        where('startAt', '<', pastCutoff),
        orderBy('startAt', 'desc')
      );
      unsubPast = onSnapshot(
        pastQ,
        (snap) => { setPast(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingPast(false); },
        (e) => { console.error(e); setErr('Failed to load past events.'); setLoadingPast(false); }
      );
    }

    // Upcoming events
    let unsubUpcoming: (() => void) | null = null;
    let unsubPublicUpcoming: (() => void) | null = null;
    let unsubTeasers: (() => void) | null = null;
    if (currentUser) {
      setLoadingUpcoming(true);
      const upcomingQ = query(eventsRef, where('startAt', '>=', nowTs), orderBy('startAt', 'asc'));
      unsubUpcoming = onSnapshot(
        upcomingQ,
        (snap) => { setUpcoming(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingUpcoming(false); },
        (e) => { console.error(e); setErr('Failed to load upcoming events.'); setLoadingUpcoming(false); }
      );
      setPublicUpcoming([]);
      setUpcomingTeasers([]);
    } else {
      setLoadingPublicUpcoming(true);
      const publicUpcomingQ = query(
        eventsRef,
        where('visibility', '==', 'public'),
        where('startAt', '>=', nowTs),
        orderBy('startAt', 'asc')
      );
      unsubPublicUpcoming = onSnapshot(
        publicUpcomingQ,
        (snap) => { setPublicUpcoming(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingPublicUpcoming(false); },
        (e) => { console.error(e); setErr('Failed to load public upcoming events.'); setLoadingPublicUpcoming(false); }
      );
      setLoadingTeasers(true);
      const teaserQ = query(teasersRef, where('startAt', '>=', nowTs), orderBy('startAt', 'asc'));
      unsubTeasers = onSnapshot(
        teaserQ,
        (snap) => { setUpcomingTeasers(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))); setLoadingTeasers(false); },
        (e) => { console.error(e); setErr('Failed to load upcoming event teasers.'); setLoadingTeasers(false); }
      );
      setUpcoming([]);
    }

    return () => {
      unsubPast();
      unsubUpcoming?.();
      unsubPublicUpcoming?.();
      unsubTeasers?.();
    };
  }, [authLoading, currentUser]);

  // Get unique tags for filter dropdown
  const allTags = useMemo(() => {
    const allEvents = [...upcoming, ...publicUpcoming, ...past];
    return [...new Set(allEvents.flatMap(e => e.tags || []))];
  }, [upcoming, publicUpcoming, past]);

  // Filtered events for both views
  const filteredEvents = useMemo(() => {
    let list = activeTab === 'upcoming' ? (currentUser ? upcoming : publicUpcoming) : past;
    if (!currentUser && activeTab === 'upcoming') {
      // Include teasers for guests in upcoming
      list = [
        ...list,
        ...upcomingTeasers.map(t => ({
          ...t,
          isTeaser: true,
          tags: [], // No tags for teasers
        })),
      ];
    }
    return list.filter(e =>
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      (!tagFilter || e.tags?.includes(tagFilter))
    );
  }, [searchQuery, tagFilter, activeTab, upcoming, publicUpcoming, past, upcomingTeasers, currentUser]);

  // Map filtered events to calendar format
  const calendarEvents = useMemo(() => {
    return filteredEvents.map((e: AnyEvent) => ({
      title: e.title,
      start: tsToDate(e.startAt),
      end: e.endAt ? tsToDate(e.endAt) : new Date(tsToDate(e.startAt).getTime() + 60 * 60 * 1000), // Use endAt if available
      allDay: false,
      resource: e,
    }));
  }, [filteredEvents]);

  // Fetch media for selected event
  useEffect(() => {
    if (!selectedEvent) {
      setEventMedia([]);
      return;
    }
    const q = query(collection(db, 'media'), where('eventId', '==', selectedEvent.id), limit(5));
    const unsub = onSnapshot(q, (snap) => {
      setEventMedia(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => {
      console.error('Failed to load event media:', e);
      toast.error('Failed to load event media.');
    });
    return unsub;
  }, [selectedEvent]);

  const EventTooltip = ({ event, children }: { event: AnyEvent; children: React.ReactNode }) => {
    const { getTooltipProps, setTooltipRef, setTriggerRef, visible } = usePopperTooltip({
      placement: 'top',
      offset: [0, 10],
      delayShow: 300,
      delayHide: 100,
    });
    return (
      <>
        <div ref={setTriggerRef}>{children}</div>
        {visible && (
          <div 
            ref={setTooltipRef} 
            {...getTooltipProps({ 
              className: 'tooltip-container bg-white border border-gray-200 rounded-lg shadow-xl p-4 max-w-xs z-[9999] pointer-events-none',
              style: {
                zIndex: 9999,
                position: 'absolute',
              }
            })}
          >
            <h3 className="font-semibold text-gray-900 mb-2">{event.title}</h3>
            <p className="text-sm text-gray-600 mb-1">{event.location}</p>
            <p className="text-sm text-gray-600 mb-2">{format(tsToDate(event.startAt), 'h:mm a')}</p>
            {event.description && <p className="text-sm text-gray-500 line-clamp-2">{event.description}</p>}
          </div>
        )}
      </>
    );
  };

  const renderUpcomingForMember = () => {
    const isLoading = loadingUpcoming;
    const list = filteredEvents;
    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {!isLoading && list.map((event: AnyEvent) => <EventCard key={event.id} event={event} onEdit={handleEditEvent} />)}
        </div>
        {isLoading && (
          <div className="text-center py-16">
            <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-500">Loading…</h3>
          </div>
        )}
        {!isLoading && list.length === 0 && (
          <div className="text-center py-16">
            <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-500 mb-2">No upcoming events found</h3>
            <p className="text-gray-400">Check back soon for new events!</p>
          </div>
        )}
      </>
    );
  };

  const renderUpcomingForGuest = () => {
    const isLoadingPublic = loadingPublicUpcoming;
    const publicList = filteredEvents.filter(e => !e.isTeaser); // Filtered public
    const teaserList = filteredEvents.filter(e => e.isTeaser); // Filtered teasers
    return (
      <>
        {!!publicList.length && (
          <>
            <h3 className="text-lg font-semibold mb-3">Upcoming (public)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {!isLoadingPublic && publicList.map((event: AnyEvent) => <EventCard key={event.id} event={event} />)}
            </div>
          </>
        )}
        <div className="rounded-xl border bg-white p-6">
          <h3 className="text-lg font-semibold mb-2">More coming up (members only)</h3>
          <p className="text-gray-600 mb-4">Sign in to see full details and RSVP. Here's a peek:</p>
          {!loadingTeasers && teaserList.length > 0 && (
            <ul className="divide-y">
              {teaserList.map((t: any) => {
                const d = tsToDate(t.startAt);
                const formatted = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                return (
                  <li key={t.id} className="py-3 flex items-center justify-between">
                    <span className="font-medium text-gray-900">{t.title}</span>
                    <span className="text-sm text-gray-500">{formatted}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {(loadingPublicUpcoming || loadingTeasers) && (
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <div className="text-gray-500">Loading…</div>
            </div>
          )}
          {!loadingTeasers && !teaserList.length && !publicList.length && (
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <div className="text-gray-500">No upcoming events posted yet. Check back soon!</div>
            </div>
          )}
          <div className="mt-6 text-center">
            <a href="/login" className="inline-block px-6 py-2 rounded-full bg-purple-600 text-white font-semibold hover:bg-purple-700">
              Sign in to see details
            </a>
          </div>
        </div>
      </>
    );
  };

  const renderPast = () => {
    const isLoading = loadingPast;
    const list = filteredEvents;
    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {!isLoading && list.map((event: AnyEvent) => <EventCard key={event.id} event={event} onEdit={handleEditEvent} />)}
        </div>
        {isLoading && (
          <div className="text-center py-16">
            <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-500">Loading…</h3>
          </div>
        )}
        {!isLoading && list.length === 0 && (
          <div className="text-center py-16">
            <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-500 mb-2">No past events found</h3>
            <p className="text-gray-400">Past events will appear here once they are completed.</p>
          </div>
        )}
      </>
    );
  };

  const renderCalendar = () => {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 relative overflow-visible">
        <BigCalendar
          localizer={localizer}
          events={calendarEvents}
          startAccessor="start"
          endAccessor="end"
          style={{ height: 600 }}
          onSelectEvent={(event: any) => {
            if (event.resource.isTeaser) {
              toast.error('Sign in to view this member-only event.');
              return;
            }
            if (currentUser || event.resource.public || activeTab === 'past') {
              setSelectedEvent(event.resource);
            } else {
              toast.error('Sign in to view event details.');
            }
          }}
          views={['month', 'week', 'day']}
          defaultView="month"
          eventPropGetter={(event: any) => ({
            className: event.resource.isTeaser ? 'bg-gray-400 opacity-50' : event.resource.public ? 'bg-purple-600' : 'bg-red-500',
            style: { color: 'white', border: 'none' },
          })}
          className="text-gray-800"
          aria-label="Events calendar"
          components={{
            event: ({ event }) => (
              <EventTooltip event={event.resource}>
                <span className="block truncate">{event.title}</span>
              </EventTooltip>
            ),
          }}
        />
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Fitness Events</h1>
          <p className="text-gray-600 text-lg">Join our community events and transform your fitness journey</p>
        </div>
        {currentUser?.role === 'admin' && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="mt-4 md:mt-0 flex items-center px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-full hover:from-purple-700 hover:to-pink-700 transition-all duration-300 transform hover:scale-105 shadow-lg"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Event
          </button>
        )}
      </div>
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search events by title..."
          className="px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 flex-1"
        />
        <select
          value={tagFilter || ''}
          onChange={(e) => setTagFilter(e.target.value || null)}
          className="px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500"
        >
          <option value="">All Tags</option>
          {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
        </select>
      </div>
      {/* Tabs and View Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${
              activeTab === 'upcoming' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-600 hover:text-purple-600'
            }`}
          >
            Upcoming {currentUser ? `(${upcoming.length})` : ''}
          </button>
          <button
            onClick={() => setActiveTab('past')}
            className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${
              activeTab === 'past' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-600 hover:text-purple-600'
            }`}
          >
            Past Events ({past.length})
          </button>
        </div>
        <button
          onClick={() => setViewMode(viewMode === 'grid' ? 'calendar' : 'grid')}
          className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-all duration-200"
        >
          {viewMode === 'grid' ? 'Calendar View' : 'Grid View'}
        </button>
      </div>
      {/* Body */}
      {viewMode === 'grid'
        ? (activeTab === 'upcoming' ? (currentUser ? renderUpcomingForMember() : renderUpcomingForGuest()) : renderPast())
        : renderCalendar()}
      {/* Error banner */}
      {err && <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{err}</div>}
      {/* Create Event Modal */}
      {isCreateModalOpen && (
        <CreateEventModal
          onClose={() => {
            setIsCreateModalOpen(false);
            setEventToEdit(null);
          }}
          onEventCreated={() => {
            setIsCreateModalOpen(false);
            setEventToEdit(null);
          }}
          eventToEdit={eventToEdit}
        />
      )}
      {/* Event Details Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">{selectedEvent.title}</h2>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <Calendar className="w-6 h-6 text-gray-500" />
              </button>
            </div>
            <div className="p-6">
              <EventCard event={selectedEvent} />
              {eventMedia.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-3">Event Media</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {eventMedia.map(m => (
                      <img
                        key={m.id}
                        src={m.thumbnailUrl || m.url}
                        alt={m.title}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Events;
