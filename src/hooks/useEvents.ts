// src/hooks/useEvents.ts
import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';

export interface Event {
  id: string;
  title: string;
  description: string;
  startAt: Timestamp;
  endAt?: Timestamp;
  visibility: 'public' | 'members' | 'private';
  createdBy: string;
  invitedUsers?: string[];
  tags?: string[];
  location?: string;
  [key: string]: any;
}

export const useEvents = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    setLoading(true);
    setError(null);

    const nowTs = new Date();
    const pastCutoff = new Date(nowTs.getTime() - (2 * 60 * 1000)); // 2 minutes ago

    // Helper functions for query constraints
    const byStartAsc = orderBy('startAt', 'asc');
    const byStartDesc = orderBy('startAt', 'desc');
    const afterNow = where('startAt', '>=', nowTs);
    const beforeNow = where('startAt', '<', pastCutoff);

    if (currentUser) {
      // Authenticated user: multiple queries for different access patterns
      const unsubs: (() => void)[] = [];
      const eventMap = new Map<string, Event>();

      const updateEvents = () => {
        const uniqueEvents = Array.from(eventMap.values());
        setEvents(uniqueEvents);
        setLoading(false);
      };

      // 1. Public + Members events (upcoming)
      const visUpcomingQ = query(
        collection(db, 'events'),
        where('visibility', 'in', ['public', 'members']),
        afterNow,
        byStartAsc
      );

      // 2. My created events (upcoming)
      const mineUpcomingQ = query(
        collection(db, 'events'),
        where('createdBy', '==', currentUser.id),
        afterNow,
        byStartAsc
      );

      // 3. Events I'm invited to (upcoming)
      const invitedUpcomingQ = query(
        collection(db, 'events'),
        where('invitedUsers', 'array-contains', currentUser.id),
        afterNow,
        byStartAsc
      );

      // 4. Past events (all types I can see)
      const visPastQ = query(
        collection(db, 'events'),
        beforeNow,
        byStartDesc
      );

      const minePastQ = query(
        collection(db, 'events'),
        where('createdBy', '==', currentUser.id),
        beforeNow,
        byStartDesc
      );

      const invitedPastQ = query(
        collection(db, 'events'),
        where('invitedUsers', 'array-contains', currentUser.id),
        beforeNow,
        byStartDesc
      );

      // Listen to all queries and merge results
      unsubs.push(
        onSnapshot(visUpcomingQ, (snap) => {
          snap.docs.forEach(doc => {
            const event = { id: doc.id, ...doc.data() } as Event;
            eventMap.set(doc.id, event);
          });
          updateEvents();
        }, (error) => {
          console.error('Error loading visibility events:', error);
          setError('Failed to load public/members events');
        })
      );

      unsubs.push(
        onSnapshot(mineUpcomingQ, (snap) => {
          snap.docs.forEach(doc => {
            const event = { id: doc.id, ...doc.data() } as Event;
            eventMap.set(doc.id, event);
          });
          updateEvents();
        }, (error) => {
          console.error('Error loading my events:', error);
          setError('Failed to load your events');
        })
      );

      unsubs.push(
        onSnapshot(invitedUpcomingQ, (snap) => {
          snap.docs.forEach(doc => {
            const event = { id: doc.id, ...doc.data() } as Event;
            eventMap.set(doc.id, event);
          });
          updateEvents();
        }, (error) => {
          console.error('Error loading invited events:', error);
          setError('Failed to load events you\'re invited to');
        })
      );

      unsubs.push(
        onSnapshot(visPastQ, (snap) => {
          snap.docs.forEach(doc => {
            const event = { id: doc.id, ...doc.data() } as Event;
            eventMap.set(doc.id, event);
          });
          updateEvents();
        }, (error) => {
          console.error('Error loading past visibility events:', error);
          setError('Failed to load past events');
        })
      );

      unsubs.push(
        onSnapshot(minePastQ, (snap) => {
          snap.docs.forEach(doc => {
            const event = { id: doc.id, ...doc.data() } as Event;
            eventMap.set(doc.id, event);
          });
          updateEvents();
        }, (error) => {
          console.error('Error loading past my events:', error);
          setError('Failed to load your past events');
        })
      );

      unsubs.push(
        onSnapshot(invitedPastQ, (snap) => {
          snap.docs.forEach(doc => {
            const event = { id: doc.id, ...doc.data() } as Event;
            eventMap.set(doc.id, event);
          });
          updateEvents();
        }, (error) => {
          console.error('Error loading past invited events:', error);
          setError('Failed to load past events you were invited to');
        })
      );

      return () => {
        unsubs.forEach(unsub => unsub());
      };
    } else {
      // Guest user: only public events
      const unsubs: (() => void)[] = [];

      // Public upcoming events
      const publicUpcomingQ = query(
        collection(db, 'events'),
        where('visibility', '==', 'public'),
        afterNow,
        byStartAsc
      );

      // Public past events
      const publicPastQ = query(
        collection(db, 'events'),
        where('visibility', '==', 'public'),
        beforeNow,
        byStartDesc
      );

      unsubs.push(
        onSnapshot(publicUpcomingQ, (snap) => {
          const upcomingEvents = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Event[];
          setEvents(prev => {
            const past = prev.filter(e => e.startAt.toDate() < nowTs);
            return [...upcomingEvents, ...past];
          });
          setLoading(false);
        }, (error) => {
          console.error('Error loading public upcoming events:', error);
          setError('Failed to load public events');
        })
      );

      unsubs.push(
        onSnapshot(publicPastQ, (snap) => {
          const pastEvents = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Event[];
          setEvents(prev => {
            const upcoming = prev.filter(e => e.startAt.toDate() >= nowTs);
            return [...upcoming, ...pastEvents];
          });
          setLoading(false);
        }, (error) => {
          console.error('Error loading public past events:', error);
          setError('Failed to load past events');
        })
      );

      return () => {
        unsubs.forEach(unsub => unsub());
      };
    }
  }, [currentUser, authLoading]);

  // Separate upcoming and past events
  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return events.filter(event => event.startAt.toDate() >= now);
  }, [events]);

  const pastEvents = useMemo(() => {
    const now = new Date();
    return events.filter(event => event.startAt.toDate() < now);
  }, [events]);

  return {
    events,
    upcomingEvents,
    pastEvents,
    loading,
    error
  };
};
