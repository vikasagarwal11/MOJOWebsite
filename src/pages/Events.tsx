// Events: members see all; guests see public upcoming + teasers; past (public only for guests)
import React, { useEffect, useState, useMemo } from 'react';
import { Calendar, Plus, X, Search } from 'lucide-react';
import { useDebouncedCallback } from 'use-debounce'; // For debounced search
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
import ReactDOM from 'react-dom'; // For portal

// Portal component to append tooltip to body
const Portal = ({ children }: { children: React.ReactNode }) => {
  return ReactDOM.createPortal(children, document.body);
};

// Custom styles for calendar tooltips
const calendarTooltipStyles = `
  .tooltip-container {
    z-index: 10000 !important; /* High z-index to ensure top layering */
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    padding: 1rem;
    max-width: 15rem;
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
    height: 22px !important; /* Increased height for better readability */
    min-height: 22px !important;
    max-height: 22px !important;
    margin: 1px 0 !important; /* Slightly more margin between events */
    padding: 2px 4px !important; /* More padding for better text display */
    font-size: 0.7rem !important; /* Slightly larger font size */
    line-height: 1.2 !important; /* Better line height for readability */
    overflow: hidden !important;
    white-space: nowrap !important;
    text-overflow: ellipsis !important;
    border-radius: 3px !important;
  }

  /* Ensure calendar cells have enough height for multiple events */
  .rbc-month-view .rbc-date-content {
    min-height: 70px !important; /* Height optimized for 3 larger events */
    padding: 2px 2px 0px 2px !important; /* Reduced bottom padding */
  }

  /* Fix empty all-day events area in week view - COMPLETELY ELIMINATE */
  .rbc-week-view .rbc-allday-cell {
    height: 0 !important; /* Completely eliminate height */
    min-height: 0 !important;
    max-height: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow: hidden !important;
    display: none !important; /* Hide completely */
  }

  .rbc-week-view .rbc-allday-events {
    height: 0 !important; /* Completely eliminate height */
    min-height: 0 !important;
    max-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    display: none !important; /* Hide completely */
  }

  /* Hide all-day events area completely */
  .rbc-week-view .rbc-allday-cell,
  .rbc-week-view .rbc-allday-events {
    display: none !important;
  }

  /* Force hide the entire all-day row in week view */
  .rbc-week-view .rbc-time-header-content .rbc-row:first-child {
    display: none !important;
  }

  /* Hide the all-day header row completely */
  .rbc-week-view .rbc-time-header .rbc-row:first-child {
    display: none !important;
  }

  /* Remove extra spacing in week view header */
  .rbc-week-view .rbc-header {
    border-bottom: 1px solid #ddd !important;
    padding: 2px 1px !important; /* Minimal padding */
    height: 24px !important; /* Fixed height */
    min-height: 24px !important;
    max-height: 24px !important;
  }

  .rbc-week-view .rbc-header + .rbc-header {
    border-left: 1px solid #ddd !important;
  }

  /* Optimize week view time slots */
  .rbc-week-view .rbc-time-slot {
    height: 25px !important; /* Compact height for time slots */
    min-height: 25px !important;
    max-height: 25px !important;
  }

  .rbc-week-view .rbc-time-content {
    border-top: 1px solid #ddd !important;
  }

  /* Ensure proper spacing in week view */
  .rbc-week-view .rbc-time-gutter {
    padding: 0 4px !important; /* Reduced padding */
    font-size: 0.75rem !important; /* Smaller font */
    width: 50px !important; /* Fixed width */
    min-width: 50px !important;
    max-width: 50px !important;
  }

  /* Fix week view column spacing */
  .rbc-week-view .rbc-time-header-content {
    border-left: 1px solid #ddd !important;
  }

  /* Ensure week view has no extra margins */
  .rbc-week-view {
    margin: 0 !important;
    padding: 0 !important;
  }

  /* Add "Today" indicator in week view header for today's column */
  .rbc-week-view .rbc-header.rbc-today::after {
    content: "Today";
    position: absolute;
    top: 2px;
    left: 2px;
    font-size: 0.6rem;
    font-weight: 700;
    color: rgb(139, 92, 246);
    background: rgba(139, 92, 246, 0.15);
    padding: 1px 4px;
    border-radius: 0.2rem;
    z-index: 2;
    white-space: nowrap;
  }

  /* Style today's column in week view */
  .rbc-week-view .rbc-header.rbc-today {
    background-color: rgba(139, 92, 246, 0.1) !important;
    border-bottom: 2px solid rgba(139, 92, 246, 0.4) !important;
    position: relative;
  }

  /* Style for "+X more" indicator - make it more compact */
  .rbc-event.rbc-event-more {
    background: rgba(139, 92, 246, 0.8) !important;
    color: white !important;
    font-weight: 600 !important;
    text-align: center !important;
    cursor: pointer !important;
    border-radius: 2px !important;
    font-size: 0.6rem !important;
    height: 14px !important;
    min-height: 14px !important;
    max-height: 14px !important;
    margin: 0.5px 0 !important;
    padding: 0px 2px !important;
    line-height: 1 !important;
  }

  /* Hover effect for events */
  .rbc-event:hover {
    opacity: 0.9 !important;
    transform: scale(1.02) !important;
    transition: all 0.2s ease !important;
  }

  /* Today Highlight - Enhanced visual indicator for current date */
  .rbc-today {
    background-color: rgba(139, 92, 246, 0.15) !important;
    border: 2px solid rgba(139, 92, 246, 0.4) !important;
    border-radius: 0.5rem !important;
    position: relative;
    display: flex !important;
    flex-direction: column !important;
    justify-content: space-between !important;
    min-height: 70px !important;
  }

  /* Make today's date number regular font like other dates */
  .rbc-today .rbc-date {
    font-weight: 400 !important; /* Regular font weight like other dates */
    color: rgb(55, 65, 81) !important; /* Same color as other dates */
    font-size: 1em !important; /* Same size as other dates */
    position: absolute !important;
    top: 2px !important;
    right: 4px !important;
    z-index: 2 !important;
  }

  /* Add bold "Today" indicator at top-left */
  .rbc-today::after {
    content: "Today";
    position: absolute;
    top: 2px;
    left: 4px;
    font-size: 0.7rem;
    font-weight: 900; /* Extra bold for maximum visibility */
    color: rgb(139, 92, 246);
    background: rgba(139, 92, 246, 0.15);
    padding: 2px 8px;
    border-radius: 0.25rem;
    z-index: 2;
    white-space: nowrap;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    box-shadow: 0 2px 4px rgba(139, 92, 246, 0.2);
  }

  /* Position events in the middle of today's cell */
  .rbc-today .rbc-event {
    margin-top: 20px !important; /* Push events down below Today label and date */
  }

  /* Position +X more at the bottom */
  .rbc-today .rbc-event.rbc-event-more {
    position: absolute !important;
    bottom: 0px !important; /* Move to very bottom */
    left: 2px !important;
    right: 2px !important;
    margin: 0 !important;
  }

  /* Add subtle underline to indicate clickability */
  .rbc-today .rbc-date::after {
    content: "";
    position: absolute;
    bottom: -2px;
    left: 0;
    right: 0;
    height: 2px;
    background: rgba(139, 92, 246, 0.3);
    border-radius: 1px;
    transform: scaleX(0);
    transition: transform 0.2s ease;
  }

  /* Show underline on hover */
  .rbc-today:hover .rbc-date::after {
    transform: scaleX(1);
  }

  /* Hover effect for today's cell */
  .rbc-today:hover {
    background-color: rgba(139, 92, 246, 0.2) !important;
    border-color: rgba(139, 92, 246, 0.6) !important;
  }

  /* Hover effect for today's date number */
  .rbc-today:hover .rbc-date {
    color: rgb(31, 41, 55) !important; /* Darker on hover */
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
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(''); // Debounced version for actual filtering
  const [isSearching, setIsSearching] = useState(false); // Loading state for search
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

  // Debounced search function - delays search execution by 300ms
  const debouncedSearch = useDebouncedCallback(
    (query: string) => {
      setDebouncedSearchQuery(query);
      setIsSearching(false);
    },
    300 // 300ms delay
  );

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
    
    // For guests, only show public events in the main list (not teasers)
    // Teasers are shown separately in the UI but not counted in the main list
    const filtered = list.filter(e =>
      e.title.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) &&
      (!tagFilter || e.tags?.includes(tagFilter))
    );
    
    // Debug logging for duplicate detection
    if (activeTab === 'upcoming') {
      console.log('🔍 Filtered Events Debug:', {
        activeTab,
        isUser: !!currentUser,
        upcoming: upcoming.length,
        publicUpcoming: publicUpcoming.length,
        teasers: upcomingTeasers.length,
        filtered: filtered.length,
        searchQuery,
        debouncedSearchQuery,
        events: filtered.map(e => ({ id: e.id, title: e.title, startAt: e.startAt, isTeaser: e.isTeaser }))
      });
    }
    
    return filtered;
  }, [debouncedSearchQuery, tagFilter, activeTab, upcoming, publicUpcoming, past, upcomingTeasers, currentUser]);

  // Map filtered events to calendar format
  const calendarEvents = useMemo(() => {
    // For calendar view, we want to show both public events and teasers
    let calendarList = [...filteredEvents];
    
    // Add teasers for guests in calendar view (but not in the main count)
    if (!currentUser && activeTab === 'upcoming') {
      const teaserEvents = upcomingTeasers.map(t => ({
        ...t,
        isTeaser: true,
        tags: [], // No tags for teasers
      }));
      calendarList = [...calendarList, ...teaserEvents];
    }
    
    // Remove duplicates based on title and start time
    const uniqueEvents = calendarList.filter((event, index, self) => 
      index === self.findIndex(e => 
        e.title === event.title && 
        tsToDate(e.startAt).getTime() === tsToDate(event.startAt).getTime()
      )
    );
    
    console.log('🔍 Calendar Events Debug:', {
      original: filteredEvents.length,
      withTeasers: calendarList.length,
      unique: uniqueEvents.length,
      events: uniqueEvents.map(e => ({ title: e.title, start: tsToDate(e.startAt), isTeaser: e.isTeaser }))
    });
    
    return uniqueEvents.map((e: AnyEvent) => ({
      title: e.title,
      start: tsToDate(e.startAt),
      end: e.endAt ? tsToDate(e.endAt) : new Date(tsToDate(e.startAt).getTime() + 60 * 60 * 1000), // Use endAt if available
      allDay: false,
      resource: e,
    }));
  }, [filteredEvents, currentUser, activeTab, upcomingTeasers]);

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
      offset: [0, 8], // Slight offset to avoid overlap with event
      delayShow: 300,
      delayHide: 100,
      followCursor: false,

    });

    // Debug log to verify positioning
    useEffect(() => {
      if (visible) {
        // Note: setTriggerRef is a setter function, not a ref object
        // We'll log when tooltip becomes visible for debugging
        console.log('Tooltip visible for event:', event.title);
      }
    }, [visible, event.title]);

    return (
      <>
        <div ref={setTriggerRef} style={{ display: 'inline-block' }}>{children}</div>
        {visible && (
          <Portal>
            <div
              ref={setTooltipRef}
              {...getTooltipProps({
                className: 'tooltip-container',
                style: {
                  zIndex: 10000, // Ensure it's above all other elements
                  position: 'fixed', // Fixed to screen, not relative to calendar
                  transform: 'translate(-50%, -100%)', // Center horizontally, move up
                  marginTop: '-10px', // Fine-tune vertical position
                },
              })}
            >
              <h3 className="font-semibold text-gray-900 mb-2">{event.title}</h3>
              <p className="text-sm text-gray-600 mb-1">{event.location || 'No location'}</p>
              <p className="text-sm text-gray-600 mb-2">{format(tsToDate(event.startAt), 'h:mm a')}</p>
              {event.description && <p className="text-sm text-gray-500 line-clamp-2">{event.description}</p>}
            </div>
          </Portal>
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
          {!isLoading && list.map((event: AnyEvent) => <EventCard key={event.id} event={event} onEdit={() => handleEditEvent(event)} />)}
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
    const publicList = filteredEvents; // filteredEvents already excludes teasers
    const teaserList = upcomingTeasers
      .filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase())); // Apply search to teasers
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
          {!isLoading && list.map((event: AnyEvent) => <EventCard key={event.id} event={event} onEdit={() => handleEditEvent(event)} />)}
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
           popup={true}
           popupOffset={30}
                                                                               dayPropGetter={(date) => ({
          style: {
            minHeight: '70px', /* Height optimized for 3 larger events */
          }
        })}
        onNavigate={(newDate) => {
          // This helps with event rendering
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
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearching(true);
              debouncedSearch(e.target.value);
            }}
            placeholder="Search events by title..."
            className="w-full px-4 py-2 pl-10 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          {isSearching && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>
            </div>
          )}
        </div>
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
            Upcoming ({currentUser ? upcoming.length : publicUpcoming.length})
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
                 aria-label="Close event details"
               >
                 <X className="w-6 h-6 text-gray-500" />
               </button>
            </div>
            <div className="p-6">
              <EventCard 
                event={selectedEvent} 
                showAdminActions={false}
                showRsvp={false}
              />
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
