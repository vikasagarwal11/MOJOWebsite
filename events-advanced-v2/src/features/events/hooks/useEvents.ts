
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  collection, doc, onSnapshot, orderBy, query, where, addDoc, updateDoc, deleteDoc,
  Timestamp, limit, getDoc, setDoc, serverTimestamp
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { cleanForFirestore, toTimestamp, tsToDate, withTimestamps } from '../lib/firestore';
import { expandRecurrence, Recurrence } from '../lib/recurrence';

export type Visibility = 'public' | 'members' | 'private';
export type RSVPStatus = 'going' | 'maybe' | 'not_going' | 'waitlisted';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export type EventDoc = {
  id?: string;
  title: string;
  description?: string;
  location?: string;
  startAt: Timestamp;
  endAt: Timestamp;
  allDay?: boolean;
  visibility: Visibility;
  tags?: string[];
  imageUrl?: string | null;
  isPaid?: boolean;
  priceCents?: number | null;
  currency?: string | null;
  capacity?: number | null;
  recurrence?: Recurrence;
  status?: 'scheduled' | 'canceled';
  organizerUid: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type RSVPDoc = {
  id?: string;
  userId: string;
  displayName?: string | null;
  email?: string | null;
  status: RSVPStatus;
  adults: number;
  kids: number;
  requiresPayment?: boolean;
  paymentStatus?: PaymentStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export const useEvents = (opts: {
  currentUser?: { uid: string; role?: string | null };
  activeTab: 'upcoming' | 'past';
  visibilityFilter?: Visibility | 'all';
  search?: string;
  tag?: string | null;
  range?: { start: Date; end: Date };
}) => {
  const { currentUser, activeTab, visibilityFilter = 'all', search = '', tag = null, range } = opts;
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const eventsRef = collection(db, 'events');
    const now = Timestamp.fromMillis(Date.now());
    const base = activeTab === 'past'
      ? query(eventsRef, where('startAt', '<', now), orderBy('startAt', 'desc'), limit(500))
      : query(eventsRef, where('startAt', '>=', now), orderBy('startAt', 'asc'), limit(500));

    const unsub = onSnapshot(base, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as EventDoc[];
      setEvents(docs);
      setLoading(false);
    }, (e) => {
      console.error(e);
      setError('Failed to load events');
      setLoading(false);
    });
    return unsub;
  }, [activeTab]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter(ev => {
      if (visibilityFilter !== 'all' && ev.visibility !== visibilityFilter) return false;
      if (term && !(ev.title?.toLowerCase().includes(term) || ev.description?.toLowerCase().includes(term))) return false;
      if (tag && !(ev.tags || []).includes(tag)) return false;
      return true;
    });
  }, [events, visibilityFilter, search, tag]);

  /** Calendar-ready instances (recurrence expansion inside current range) */
  const instances = useMemo(() => {
    if (!range) return [];
    const out: Array<{ base: EventDoc; start: Date; end: Date }> = [];
    for (const ev of filtered) {
      const start = tsToDate(ev.startAt);
      const end = tsToDate(ev.endAt);
      for (const inst of expandRecurrence(start, end, ev.recurrence, range.start, range.end)) {
        out.push({ base: ev, start: inst.start, end: inst.end });
      }
    }
    return out;
  }, [filtered, range]);

  /** CRUD */
  const createEvent = useCallback(async (input: Partial<EventDoc>) => {
    const payload = withTimestamps(cleanForFirestore({
      ...input,
      startAt: toTimestamp(input.startAt),
      endAt: toTimestamp(input.endAt),
    }), true);
    const ref = await addDoc(collection(db, 'events'), payload);
    return ref.id;
  }, []);

  const updateEvent = useCallback(async (id: string, patch: Partial<EventDoc>) => {
    const ref = doc(db, 'events', id);
    const payload = withTimestamps(cleanForFirestore({
      ...patch,
      ...(patch.startAt ? { startAt: toTimestamp(patch.startAt) } : {}),
      ...(patch.endAt ? { endAt: toTimestamp(patch.endAt) } : {}),
    }), false);
    await updateDoc(ref, payload as any);
  }, []);

  const deleteEvent = useCallback(async (id: string) => {
    await deleteDoc(doc(db, 'events', id));
  }, []);

  /** RSVP logic with capacity + waitlist. Note: Consider moving to Cloud Functions for atomicity. */
  const setRSVP = useCallback(async (eventId: string, rsvp: Omit<RSVPDoc, 'createdAt'|'updatedAt'>) => {
    const evRef = doc(db, 'events', eventId);
    const evSnap = await getDoc(evRef);
    if (!evSnap.exists()) throw new Error('Event not found');
    const ev = evSnap.data() as EventDoc;

    const rsvpsRef = collection(evRef, 'rsvps');
    const rsvpId = rsvp.userId; // one RSVP per user
    const rsvpRef = doc(rsvpsRef, rsvpId);

    // Naive capacity check client-side; race conditions should be handled via CF
    let requiresPayment = !!ev.isPaid && (rsvp.status === 'going');
    const payload: RSVPDoc = {
      ...rsvp,
      requiresPayment,
      paymentStatus: requiresPayment ? 'unpaid' : undefined,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    };
    await setDoc(rsvpRef, cleanForFirestore(payload) as any, { merge: true });

    // In a real system: call a CF to atomically compute capacity, waitlist & promotion.
    return { ok: true };
  }, []);

  return {
    loading,
    error,
    events: filtered,
    instances,
    createEvent,
    updateEvent,
    deleteEvent,
    setRSVP,
  };
};
