// Events: members see all; guests see public upcoming + teasers; past (public only for guests)
import React, { useEffect, useState } from 'react';
import { Calendar, Plus } from 'lucide-react';
import { collection, onSnapshot, orderBy, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import EventCard from '../components/events/EventCard';
import CreateEventModal from '../components/events/CreateEventModal';

import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import enUS from 'date-fns/locale/en-US';
import 'react-big-calendar/lib/css/react-big-calendar.css';

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
  const { currentUser, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [upcoming, setUpcoming] = useState<AnyEvent[]>([]);           // members only
  const [publicUpcoming, setPublicUpcoming] = useState<AnyEvent[]>([]); // guests
  const [upcomingTeasers, setUpcomingTeasers] = useState<Teaser[]>([]);
  const [past, setPast] = useState<AnyEvent[]>([]);                   // for guests: public only

  const [loadingUpcoming, setLoadingUpcoming] = useState(false);
  const [loadingPublicUpcoming, setLoadingPublicUpcoming] = useState(false);
  const [loadingPast, setLoadingPast] = useState(true);
  const [loadingTeasers, setLoadingTeasers] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    setErr(null);

    const eventsRef = collection(db, 'events');
    const teasersRef = collection(db, 'event_teasers');

    // Buffer for past vs server time skew
    const SKEW_MS = 2 * 60 * 1000;
    const nowClientMs = Date.now();
    const pastCutoff = Timestamp.fromMillis(nowClientMs - SKEW_MS);
    const nowTs = Timestamp.fromMillis(nowClientMs);

    // --- Past events ---
    let unsubPast: () => void;
    if (currentUser) {
      // Members: all past
      const pastQ = query(eventsRef, where('startAt', '<', pastCutoff), orderBy('startAt', 'desc'));
      unsubPast = onSnapshot(
        pastQ,
        (snap) => { setPast(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingPast(false); },
        (e) => { console.error(e); setErr('Failed to load past events.'); setLoadingPast(false); }
      );
    } else {
      // Guests: public past only
      const pastQ = query(
        eventsRef,
        where('public', '==', true),
        where('startAt', '<', pastCutoff),
        orderBy('startAt', 'desc')
      );
      unsubPast = onSnapshot(
        pastQ,
        (snap) => { setPast(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingPast(false); },
        (e) => { console.error(e); setErr('Failed to load past events.'); setLoadingPast(false); }
      );
    }

    // --- Upcoming ---
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
      // Guests: public upcoming + teasers
      setLoadingPublicUpcoming(true);
      const publicUpcomingQ = query(
        eventsRef,
        where('public', '==', true),
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

  const renderUpcomingForMember = () => {
    const isLoading = loadingUpcoming;
    const list = upcoming;

    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {!isLoading && list.map((event: AnyEvent) => <EventCard key={event.id} event={event} />)}
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
    const publicList = publicUpcoming;

    const isLoadingTeasers = loadingTeasers;
    const teaserList = upcomingTeasers;

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

        {/* Teasers */}
        <div className="rounded-xl border bg-white p-6">
          <h3 className="text-lg font-semibold mb-2">More coming up (members only)</h3>
          <p className="text-gray-600 mb-4">Sign in to see full details and RSVP. Here’s a peek:</p>

          {!isLoadingTeasers && teaserList.length > 0 && (
            <ul className="divide-y">
              {teaserList.map((t) => {
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

          {(isLoadingPublic || isLoadingTeasers) && (
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <div className="text-gray-500">Loading…</div>
            </div>
          )}

          {!isLoadingTeasers && !teaserList.length && !publicList.length && (
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
    const list = past;

    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {!isLoading && list.map((event: AnyEvent) => <EventCard key={event.id} event={event} />)}
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

      {/* Tabs */}
      <div className="flex space-x-1 mb-8 bg-gray-100 p-1 rounded-lg inline-flex">
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

      {/* Body */}
      {activeTab === 'upcoming' ? (currentUser ? renderUpcomingForMember() : renderUpcomingForGuest()) : renderPast()}

      {/* Error banner */}
      {err && <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{err}</div>}

      {/* Create Event Modal */}
      {isCreateModalOpen && (
        <CreateEventModal
          onClose={() => setIsCreateModalOpen(false)}
          onEventCreated={() => setIsCreateModalOpen(false)}
        />
      )}
    </div>
  );
};

export default Events;
