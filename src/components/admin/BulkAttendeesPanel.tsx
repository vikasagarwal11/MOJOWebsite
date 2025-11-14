import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { BulkAttendeeTool } from './BulkAttendeeTool';

type EventSummary = {
  id: string;
  title: string;
  maxAttendees: number;
  attendingCount: number;
  waitlistEnabled: boolean;
  waitlistLimit: number;
  startAt: Date;
  endAt: Date;
  status: string;
};

export type BulkAttendeesPanelProps = {
  className?: string;
};

export const BulkAttendeesPanel: React.FC<BulkAttendeesPanelProps> = ({ className }) => {
  const { currentUser } = useAuth();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;

    const eventsRef = collection(db, 'events');
    const q = query(eventsRef, orderBy('startAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const eventsData: EventSummary[] = snapshot.docs.map((doc) => {
          const raw = doc.data() as any;
          return {
            id: doc.id,
            title: raw.title ?? 'Untitled Event',
            maxAttendees: raw.maxAttendees ?? 0,
            attendingCount: raw.attendingCount ?? 0,
            waitlistEnabled: !!raw.waitlistEnabled,
            waitlistLimit: raw.waitlistLimit ?? 0,
            startAt: raw.startAt?.toDate?.() ?? new Date(),
            endAt: raw.endAt?.toDate?.() ?? new Date(),
            status: raw.status ?? 'Active',
          };
        });

        setEvents(eventsData);
        setIsLoading(false);
        if (import.meta.env.DEV) {
          console.info('[BulkAttendeesPanel] Loaded events', { count: eventsData.length });
        }
      },
      (error) => {
        console.error('[BulkAttendeesPanel] Failed to load events', error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  if (!currentUser) {
    return (
      <div className={`rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600 ${className ?? ''}`}>
        Admin access required. Please sign in.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white/60 p-8 text-sm text-gray-600 ${className ?? ''}`}>
        <div className="mb-3 h-10 w-10 animate-spin rounded-full border-4 border-[#F25129] border-t-transparent" />
        Loading events…
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className={`rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600 shadow-sm ${className ?? ''}`}>
        No events found. Create an event before using the bulk attendee tool.
      </div>
    );
  }

  return (
    <div className={`space-y-5 ${className ?? ''}`}>
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white/80 p-5 shadow-sm">
        <header>
          <h3 className="text-lg font-semibold text-gray-900">Select an Event</h3>
          <p className="text-sm text-gray-600">Choose an event to bulk-add or reconcile attendees.</p>
        </header>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {events.map((event) => {
            const isActive = event.id === selectedEventId;
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => setSelectedEventId(event.id)}
                className={`flex flex-col items-start rounded-2xl border p-4 text-left transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#F25129] ${
                  isActive
                    ? 'border-[#F25129] bg-[#F25129]/10 shadow'
                    : 'border-gray-200 bg-white hover:border-[#F25129]/40'
                }`}
              >
                <span className="text-base font-semibold text-gray-900">{event.title}</span>
                <span className="mt-1 text-xs uppercase tracking-wide text-gray-500">Event ID: {event.id.slice(0, 6)}…</span>

                <dl className="mt-4 space-y-1 text-xs text-gray-600">
                  <div className="flex justify-between">
                    <dt className="font-medium text-gray-500">Date:</dt>
                    <dd>{event.startAt.toLocaleDateString()}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="font-medium text-gray-500">Capacity:</dt>
                    <dd>
                      {event.attendingCount} / {event.maxAttendees || '∞'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="font-medium text-gray-500">Waitlist:</dt>
                    <dd>
                      {event.waitlistEnabled ? (
                        <span className="text-green-600">
                          Enabled{event.waitlistLimit ? ` (${event.waitlistLimit})` : ''}
                        </span>
                      ) : (
                        'Disabled'
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="font-medium text-gray-500">Status:</dt>
                    <dd>{event.status}</dd>
                  </div>
                </dl>
              </button>
            );
          })}
        </div>
      </div>

      {selectedEvent && (
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-white/90 p-6 shadow-sm">
          <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">{selectedEvent.title}</h3>
              <p className="text-sm text-gray-500">
                {selectedEvent.attendingCount} attending • Waitlist{' '}
                {selectedEvent.waitlistEnabled ? (
                  <span className="text-green-600">
                    enabled{selectedEvent.waitlistLimit ? ` (limit ${selectedEvent.waitlistLimit})` : ''}
                  </span>
                ) : (
                  'disabled'
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedEventId(null)}
              className="inline-flex items-center rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-[#F25129] hover:bg-[#F25129]/10 hover:text-[#F25129]"
            >
              ← Choose another event
            </button>
          </header>

          <BulkAttendeeTool
            eventId={selectedEvent.id}
            eventTitle={selectedEvent.title}
            maxAttendees={selectedEvent.maxAttendees}
            onComplete={() => setSelectedEventId(null)}
          />
        </div>
      )}
    </div>
  );
};

export default BulkAttendeesPanel;

