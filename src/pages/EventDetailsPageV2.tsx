import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Calendar,
  CalendarCheck,
  CheckCircle,
  Clock,
  DollarSign,
  ExternalLink,
  MapPin,
  Share2,
  Users,
  XCircle
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EventImage } from '../components/events/EventImage';
import { EventSeo } from '../components/seo/EventSeo';
import { auth, db } from '../config/firebase';
import { EventDoc } from '../hooks/useEvents';
import { safeFormat, safeToDate } from '../utils/dateUtils';

type AttendeeDoc = {
  id: string;
  userId: string;
  attendeeType?: string;
  rsvpStatus?: 'going' | 'not-going' | 'waitlisted';
  paymentStatus?: 'pending' | 'confirmed' | 'not_required';
  [k: string]: any;
};

const pillBase =
  'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset';

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

function isPaidEvent(event?: EventDoc | null) {
  const pricing: any = (event as any)?.pricing;
  if (!pricing) return false;
  if (pricing?.type === 'free') return false;
  // Defensive: treat any configured amount as paid
  const amount = pricing?.amount ?? pricing?.price ?? pricing?.perPersonAmount;
  return typeof amount === 'number' ? amount > 0 : Boolean(amount);
}

function getPriceLabel(event?: EventDoc | null) {
  const pricing: any = (event as any)?.pricing;
  if (!pricing) return 'Free';
  if (pricing?.type === 'free') return 'Free';
  const amount = pricing?.amount ?? pricing?.price ?? pricing?.perPersonAmount;
  if (typeof amount === 'number') return `$${amount}`;
  if (typeof amount === 'string' && amount.trim()) return `$${amount}`;
  return 'Paid';
}

function getVenueLine(event?: EventDoc | null) {
  const venueName = (event as any)?.venueName ?? '';
  const venueAddress = (event as any)?.venueAddress ?? '';
  if (venueName && venueAddress) return `${venueName} • ${venueAddress}`;
  return venueName || venueAddress || 'TBD';
}

function toMapsUrl(addressOrName: string) {
  const q = encodeURIComponent(addressOrName);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

const EventDetailsPageV2: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [userAttendee, setUserAttendee] = useState<AttendeeDoc | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!eventId) {
      setError('Missing event ID');
      setLoading(false);
      return;
    }

    const eventRef = doc(db, 'events', eventId);

    const unsubscribe = onSnapshot(
      eventRef,
      (eventSnap) => {
        if (eventSnap.exists()) {
          const eventData = eventSnap.data();
          setEvent({ id: eventSnap.id, ...eventData } as EventDoc);
          setError(null);
        } else {
          setError('Event not found');
        }
        setLoading(false);
      },
      (err) => {
        console.error('EventDetailsPageV2: Error fetching event:', err);
        setError('Failed to load event');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) {
        setUserAttendee(null);
        return;
      }

      const attendeesRef = collection(db, 'events', eventId, 'attendees');
      const q = query(attendeesRef, where('userId', '==', user.uid));

      const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const attendeeDoc = snapshot.docs[0];
          setUserAttendee({ id: attendeeDoc.id, ...attendeeDoc.data() } as AttendeeDoc);
        } else {
          setUserAttendee(null);
        }
      });

      return () => unsubscribeSnapshot();
    });

    return () => unsubscribeAuth();
  }, [eventId]);

  const startDate = useMemo(() => safeToDate((event as any)?.startAt), [event]);
  const endDate = useMemo(() => safeToDate((event as any)?.endAt), [event]);

  const status = useMemo(() => {
    const rsvp = userAttendee?.rsvpStatus;
    if (rsvp === 'going') return { label: "You're going", tone: 'good' as const, icon: CheckCircle };
    if (rsvp === 'waitlisted') return { label: "You're waitlisted", tone: 'warn' as const, icon: CalendarCheck };
    if (rsvp === 'not-going') return { label: "Not going", tone: 'muted' as const, icon: XCircle };
    return { label: 'Not responded', tone: 'muted' as const, icon: Calendar };
  }, [userAttendee]);

  const capacityLine = useMemo(() => {
    const going = (event as any)?.attendingCount ?? 0;
    const max = (event as any)?.maxAttendees;
    if (typeof max === 'number' && max > 0) return `${going} going • ${Math.max(max - going, 0)} spots left`;
    return `${going} going`;
  }, [event]);

  const paid = useMemo(() => isPaidEvent(event), [event]);
  const priceLabel = useMemo(() => getPriceLabel(event), [event]);
  const venueLine = useMemo(() => getVenueLine(event), [event]);

  const paymentChip = useMemo(() => {
    if (!paid) return null;
    const ps = userAttendee?.paymentStatus;
    if (ps === 'confirmed') return { label: 'Payment confirmed', tone: 'good' as const };
    if (ps === 'pending') return { label: 'Payment pending', tone: 'warn' as const };
    return { label: 'Payment required', tone: 'warn' as const };
  }, [paid, userAttendee]);

  const handleBack = () => {
    // Prefer browser back when possible; otherwise go to events list.
    if (window.history.length > 2) navigate(-1);
    else navigate('/events');
  };

  const handleShare = async () => {
    if (!event) return;
    const title = (event as any)?.title ?? 'Event';
    const url = canonicalUrl || window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
    } catch {
      // fall through to clipboard
    }

    try {
      await navigator.clipboard.writeText(url);
      setShareOpen(true);
      setTimeout(() => setShareOpen(false), 1800);
    } catch {
      setShareOpen(true);
      setTimeout(() => setShareOpen(false), 1800);
    }
  };

  const canRsvp = Boolean(eventId) && !loading && !error;

  // Generate canonical URL for V2
  const canonicalUrl = useMemo(() => {
    if (!event) return '';
    const baseUrl = 'https://momfitnessmojo.web.app';
    const eventSlug = (event as any).slug || event.id;
    return `${baseUrl}/events-v2/${eventSlug}`;
  }, [event]);

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-[#F25129] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading event...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error || !event) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-50 to-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Event Not Found</h2>
          <p className="text-gray-600 mb-4">{error || 'The event you are looking for does not exist.'}</p>
          <button
            onClick={() => navigate('/events-v2')}
            className="px-4 py-2 bg-[#F25129] text-white rounded-lg hover:bg-[#d9451f]"
          >
            Back to Events
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 to-white">
      <EventSeo
        event={event}
        canonicalUrl={canonicalUrl}
      />

      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 hover:bg-black/5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 hover:bg-black/5"
              aria-label="Share event"
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-4 pb-28 pt-6">
        {loading && (
          <div className="animate-pulse">
            <div className="h-56 w-full rounded-3xl bg-black/5" />
            <div className="mt-6 h-7 w-2/3 rounded-lg bg-black/5" />
            <div className="mt-3 h-5 w-1/2 rounded-lg bg-black/5" />
            <div className="mt-10 h-28 w-full rounded-2xl bg-black/5" />
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
            <div className="text-sm font-semibold">Unable to load event</div>
            <div className="mt-1 text-sm">{error}</div>
            <button
              className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50"
              onClick={() => navigate('/events')}
            >
              Go to Events
            </button>
          </div>
        )}

        {!loading && !error && event && (
          <>
            {/* Hero */}
            <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
              <div className="relative">
                <EventImage
                  src={(event as any)?.imageUrl}
                  alt={(event as any)?.title || 'Event'}
                  aspect="16/9"
                  fit="cover"
                  className="w-full"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

                <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={classNames(
                        pillBase,
                        status.tone === 'good' && 'bg-emerald-50 text-emerald-700 ring-emerald-200',
                        status.tone === 'warn' && 'bg-amber-50 text-amber-700 ring-amber-200',
                        status.tone === 'muted' && 'bg-white/80 text-gray-800 ring-white/40'
                      )}
                    >
                      <status.icon className="h-4 w-4" />
                      {status.label}
                    </span>

                    <span className={classNames(pillBase, 'bg-white/80 text-gray-800 ring-white/40')}>
                      <Users className="h-4 w-4" />
                      {capacityLine}
                    </span>

                    <span className={classNames(pillBase, 'bg-white/80 text-gray-800 ring-white/40')}>
                      <DollarSign className="h-4 w-4" />
                      {priceLabel}
                    </span>

                    {paymentChip && (
                      <span
                        className={classNames(
                          pillBase,
                          paymentChip.tone === 'good' && 'bg-emerald-50 text-emerald-700 ring-emerald-200',
                          paymentChip.tone === 'warn' && 'bg-amber-50 text-amber-700 ring-amber-200'
                        )}
                      >
                        <DollarSign className="h-4 w-4" />
                        {paymentChip.label}
                      </span>
                    )}
                  </div>

                  <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                    {(event as any)?.title || 'Event'}
                  </h1>

                  <div className="mt-2 flex flex-col gap-1 text-sm text-white/90 sm:flex-row sm:items-center sm:gap-4">
                    <div className="inline-flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {startDate ? safeFormat(startDate, 'EEE, MMM d') : 'TBD'}
                    </div>
                    <div className="inline-flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {startDate ? safeFormat(startDate, 'h:mm a') : 'TBD'}
                      {endDate ? ` – ${safeFormat(endDate, 'h:mm a')}` : ''}
                    </div>
                    <a
                      href={toMapsUrl(venueLine)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 underline decoration-white/30 underline-offset-4 hover:decoration-white/60"
                      onClick={(e) => {
                        // allow normal navigation; do not intercept
                      }}
                    >
                      <MapPin className="h-4 w-4" />
                      {venueLine}
                      <ExternalLink className="h-4 w-4 opacity-80" />
                    </a>
                  </div>
                </div>
              </div>

              {/* At a glance */}
              <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3 sm:gap-4 sm:p-6">
                <div className="rounded-2xl border border-black/5 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Date</div>
                  <div className="mt-1 text-sm font-medium text-gray-900">
                    {startDate ? safeFormat(startDate, 'EEEE, MMMM d') : 'TBD'}
                  </div>
                </div>
                <div className="rounded-2xl border border-black/5 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Time</div>
                  <div className="mt-1 text-sm font-medium text-gray-900">
                    {startDate ? safeFormat(startDate, 'h:mm a') : 'TBD'}
                    {endDate ? ` – ${safeFormat(endDate, 'h:mm a')}` : ''}
                  </div>
                </div>
                <div className="rounded-2xl border border-black/5 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Price</div>
                  <div className="mt-1 text-sm font-medium text-gray-900">{priceLabel}</div>
                </div>
              </div>
            </div>

            {/* Details + Who's going */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm sm:p-6">
                  <div className="text-sm font-semibold text-gray-900">Details</div>
                  <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                    {(event as any)?.description?.trim()
                      ? (event as any)?.description
                      : 'Details will be shared soon.'}
                  </div>

                  {(event as any)?.tags?.length ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {(event as any)?.tags.slice(0, 12).map((t: string) => (
                        <span key={t} className={classNames(pillBase, 'bg-gray-50 text-gray-700 ring-gray-200')}>
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {/* Policy / Notes */}
                  {(event as any)?.policy?.trim() ? (
                    <div className="mt-6 rounded-2xl bg-gray-50 p-4 ring-1 ring-inset ring-gray-200">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Policy</div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{(event as any)?.policy}</div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="lg:col-span-1">
                <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-900">Your RSVP</div>
                    {paid && (
                      <span className={classNames(pillBase, 'bg-gray-50 text-gray-700 ring-gray-200')}>
                        <DollarSign className="h-4 w-4" />
                        {priceLabel}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 text-sm text-gray-700">
                    {status.label}
                    {paymentChip ? (
                      <div className="mt-2 text-xs text-gray-500">{paymentChip.label}</div>
                    ) : null}
                  </div>

                  <button
                    disabled={!canRsvp}
                    onClick={() => navigate(`/events-v2/${eventId}/rsvp`)}
                    className={classNames(
                      'mt-5 w-full rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm transition',
                      !canRsvp && 'cursor-not-allowed bg-gray-200 text-gray-500',
                      canRsvp && 'bg-gradient-to-r from-rose-500 to-orange-500 text-white hover:opacity-95'
                    )}
                  >
                    {userAttendee?.rsvpStatus ? 'Manage RSVP' : 'RSVP Now'}
                  </button>

                  <div className="mt-4 rounded-2xl bg-gray-50 p-4 ring-1 ring-inset ring-gray-200">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Location</div>
                    <div className="mt-2 text-sm font-medium text-gray-900">{venueLine}</div>
                    <a
                      className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-rose-600 hover:text-rose-700"
                      href={toMapsUrl(venueLine)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in Maps <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sticky bottom CTA for mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-gray-900">{event ? (event as any)?.title : 'Event'}</div>
            <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {capacityLine}
              </span>
              <span className="inline-flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                {priceLabel}
              </span>
            </div>
          </div>

          <button
            disabled={!canRsvp}
            onClick={() => navigate(`/events-v2/${eventId}/rsvp`)}
            className={classNames(
              'shrink-0 rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm transition',
              !canRsvp && 'cursor-not-allowed bg-gray-200 text-gray-500',
              canRsvp && 'bg-gradient-to-r from-rose-500 to-orange-500 text-white hover:opacity-95'
            )}
          >
            {userAttendee?.rsvpStatus ? 'Manage RSVP' : 'RSVP'}
          </button>
        </div>
      </div>

      {/* Share toast */}
      <AnimatePresence>
        {shareOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-2xl bg-gray-900 px-4 py-2 text-sm text-white shadow-lg"
          >
            Link copied
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EventDetailsPageV2;

