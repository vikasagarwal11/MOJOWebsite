import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, onSnapshot, orderBy, query, where, Timestamp, Query, FirestoreError } from 'firebase/firestore';
import { db } from '../config/firebase';
import { toMillis } from './useEventsUtils';

export type EventDoc = {
  id: string;
  title: string;
  startAt: any;
  endAt?: any;
  duration?: number;
  visibility?: 'public' | 'members' | 'private';
  createdBy?: string;
  invitedUserIds?: string[];
  tags?: string[];
  allDay?: boolean;
  location?: string; // Keep for backward compatibility
  venueName?: string; // New: "Short Hills Racquet Club"
  venueAddress?: string; // New: "123 Main St, Short Hills, NJ 07078"
  description?: string;
  imageUrl?: string;
  isTeaser?: boolean;
  maxAttendees?: number;
  attendingCount?: number;
  waitlistEnabled?: boolean;
  waitlistLimit?: number;
  // QR Code Attendance Tracking
  qrCode?: string; // Generated QR code data
  qrCodeGeneratedAt?: any; // Timestamp when QR was generated
  attendanceEnabled?: boolean; // Admin can enable/disable QR attendance
  attendanceCount?: number; // Real-time attendance count from QR scans
  lastAttendanceUpdate?: any; // Last time attendance was updated
  // Payment Configuration
  pricing?: import('../types/payment').EventPricing;
};

type UseEventsOptions = { skewMs?: number; includeGuestTeasers?: boolean; };
type UseEventsResult = { upcomingEvents: EventDoc[]; pastEvents: EventDoc[]; upcomingTeasers: EventDoc[]; loading: boolean; error: string | null; };

export function useEvents(opts: UseEventsOptions = {}): UseEventsResult {
  const { currentUser, loading: authLoading } = useAuth();
  const skewMs = opts.skewMs ?? 2 * 60 * 1000;
  const includeGuestTeasers = opts.includeGuestTeasers ?? true;

  const [upcomingEvents, setUpcomingEvents] = useState<EventDoc[]>([]);
  const [pastEvents, setPastEvents] = useState<EventDoc[]>([]);
  const [upcomingTeasers, setUpcomingTeasers] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const upcomingMapRef = useRef<Map<string, EventDoc>>(new Map());
  const pastMapRef = useRef<Map<string, EventDoc>>(new Map());

  const nowMs = Date.now();
  const nowTs = Timestamp.fromMillis(nowMs);
  const pastCutoff = Timestamp.fromMillis(nowMs - skewMs);

  const eventsRef = collection(db, 'events');
  const teasersRef = collection(db, 'event_teasers');

  const buildUpcomingQueries = (): Query[] => {
    if (!currentUser) {
      return [query(eventsRef, where('visibility', '==', 'public'), where('startAt', '>=', nowTs), orderBy('startAt', 'asc'))];
    }
    return [
      query(eventsRef, where('visibility', 'in', ['public', 'members']), where('startAt', '>=', nowTs), orderBy('startAt', 'asc')),
      query(eventsRef, where('createdBy', '==', currentUser.id), where('startAt', '>=', nowTs), orderBy('startAt', 'asc')),
      // Check for both new and legacy field names
      query(eventsRef, where('invitedUserIds', 'array-contains', currentUser.id), where('startAt', '>=', nowTs), orderBy('startAt', 'asc')),
      query(eventsRef, where('invitedUsers', 'array-contains', currentUser.id), where('startAt', '>=', nowTs), orderBy('startAt', 'asc')),
    ];
  };

  const buildPastQueries = (): Query[] => {
    if (!currentUser) {
      return [query(eventsRef, where('visibility', '==', 'public'), where('startAt', '<', pastCutoff), orderBy('startAt', 'desc'))];
    }
    return [
      query(eventsRef, where('visibility', 'in', ['public', 'members']), where('startAt', '<', pastCutoff), orderBy('startAt', 'desc')),
      query(eventsRef, where('createdBy', '==', currentUser.id), where('startAt', '<', pastCutoff), orderBy('startAt', 'desc')),
      // Check for both new and legacy field names
      query(eventsRef, where('invitedUserIds', 'array-contains', currentUser.id), where('startAt', '<', pastCutoff), orderBy('startAt', 'desc')),
      query(eventsRef, where('invitedUsers', 'array-contains', currentUser.id), where('startAt', '<', pastCutoff), orderBy('startAt', 'desc')),
    ];
  };

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    setError(null);

    const upcomingMap = new Map<string, EventDoc>();
    const pastMap = new Map<string, EventDoc>();
    upcomingMapRef.current = upcomingMap;
    pastMapRef.current = pastMap;

    const upcomingQs = buildUpcomingQueries();
    const pastQs = buildPastQueries();

    let loadedUpcoming = 0;
    let loadedPast = 0;

    const unsubs: Array<() => void> = [];

    const onErr = (e: FirestoreError) => {
      console.error('[events] snapshot error', e);
      setError(e.message || 'Failed to load events.');
      setLoading(false);
    };

    // upcoming listeners
    for (const qy of upcomingQs) {
      const unsub = onSnapshot(qy, (snap) => {
        snap.docs.forEach((d) => upcomingMap.set(d.id, { id: d.id, ...(d.data() as any) }));
        loadedUpcoming += 1;
        if (loadedUpcoming >= upcomingQs.length) {
          const arr = Array.from(upcomingMap.values()).sort((a,b)=> toMillis(a.startAt)-toMillis(b.startAt));
          setUpcomingEvents(arr);
          if (loadedPast >= pastQs.length) setLoading(false);
        }
      }, onErr);
      unsubs.push(unsub);
    }

    // past listeners
    for (const qy of pastQs) {
      const unsub = onSnapshot(qy, (snap) => {
        snap.docs.forEach((d) => pastMap.set(d.id, { id: d.id, ...(d.data() as any) }));
        loadedPast += 1;
        if (loadedPast >= pastQs.length) {
          const arr = Array.from(pastMap.values()).sort((a,b)=> toMillis(b.startAt)-toMillis(a.startAt));
          setPastEvents(arr);
          if (loadedUpcoming >= upcomingQs.length) setLoading(false);
        }
      }, onErr);
      unsubs.push(unsub);
    }

    // guest teasers
    let teasersUnsub: (() => void) | null = null;
    if (!currentUser && includeGuestTeasers) {
      teasersUnsub = onSnapshot(
        query(teasersRef, where('startAt', '>=', nowTs), orderBy('startAt', 'asc')),
        (snap) => setUpcomingTeasers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any), isTeaser: true }))),
        onErr
      );
    } else {
      setUpcomingTeasers([]);
    }

    return () => {
      unsubs.forEach((u) => u && u());
      if (teasersUnsub) teasersUnsub();
    };
  }, [authLoading, currentUser?.id]); // re-run when auth resolves or user changes

  return { upcomingEvents, pastEvents, upcomingTeasers, loading, error };
}
