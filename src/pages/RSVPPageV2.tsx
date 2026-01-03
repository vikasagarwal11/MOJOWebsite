import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  MapPin,
  Users,
  XCircle
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoadingButton } from '../components/ui/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';
import { useAttendees } from '../hooks/useAttendees';
import { EventDoc } from '../hooks/useEvents';
import { useFamilyMembers } from '../hooks/useFamilyMembers';
import { useWaitlistPositions } from '../hooks/useWaitlistPositions';
import { safeFormat, safeToDate } from '../utils/dateUtils';
import { db } from '../config/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { PaymentSection } from '../components/events/PaymentSection';
import { QRCodeTab } from '../components/events/QRCodeTab';
import { Attendee, AgeGroup, AttendeeStatus, CreateAttendeeData, Relationship } from '../types/attendee';
import { WhosGoingTab } from '../components/events/RSVPModalNew/components/WhosGoingTab';
import { useEventDates } from '../components/events/RSVPModalNew/hooks/useEventDates';
import { useCapacityState } from '../components/events/RSVPModalNew/hooks/useCapacityState';

type ActiveView = 'rsvp' | 'whosgoing' | 'qr';

const pillBase =
  'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset';

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

function isPaidEvent(event?: EventDoc | null) {
  const pricing: any = (event as any)?.pricing;
  if (!pricing) return false;
  if (pricing?.type === 'free') return false;
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

const RSVPPageV2: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { currentUser, isAdmin } = useAuth();

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<ActiveView>('rsvp');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const paid = useMemo(() => isPaidEvent(event), [event]);
  const priceLabel = useMemo(() => getPriceLabel(event), [event]);
  const venueLine = useMemo(() => getVenueLine(event), [event]);

  // Safe event for hooks
  const emptyEvent = useMemo(() => ({} as EventDoc), []);
  const { isEventPast } = useEventDates(event || emptyEvent);

  // Load event realtime
  useEffect(() => {
    if (!eventId) {
      setError('Missing event ID');
      setLoading(false);
      return;
    }

    const eventRef = doc(db, 'events', eventId);

    const unsubscribe = onSnapshot(
      eventRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const loaded = { id: snap.id, ...data } as EventDoc;
          setEvent(loaded);
          setError(null);
        } else {
          setError('Event not found');
        }
        setLoading(false);
      },
      (err) => {
        console.error('RSVPPageV2: Error fetching event:', err);
        setError('Failed to load event details');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [eventId]);

  // Attendees hook (user-scoped unless admin)
  const {
    attendees,
    counts,
    addAttendee,
    updateAttendee,
    removeAttendee,
    bulkAddAttendees,
    loading: attendeesLoading,
    error: attendeesError
  } = useAttendees(event?.id || '', currentUser?.id || '', Boolean(isAdmin));

  const { familyMembers } = useFamilyMembers();

  // Waitlist positions - only when enabled
  const { positions: waitlistPositions, myPosition: waitlistPosition } = useWaitlistPositions(
    (event as any)?.waitlistEnabled ? (event?.id || '') : '',
    (event as any)?.waitlistEnabled ? (currentUser?.id || '') : ''
  );

  const capacityState = useCapacityState(
    {
      goingCount: counts.goingCount,
      notGoingCount: counts.notGoingCount,
      waitlistedCount: counts.waitlistedCount,
      totalGoing: counts.totalGoing
    },
    (event as any)?.maxAttendees,
    (event as any)?.waitlistEnabled,
    (event as any)?.waitlistLimit
  );

  const primaryAttendee = useMemo(() => {
    if (!currentUser) return undefined;
    return attendees.find(
      (a) => a.userId === currentUser.id && a.attendeeType === 'primary'
    );
  }, [attendees, currentUser]);

  const myAttendees = useMemo(() => {
    if (!currentUser) return [];
    return attendees.filter((a) => a.userId === currentUser.id);
  }, [attendees, currentUser]);

  const myFamilyAndGuests = useMemo(() => {
    if (!currentUser) return [];
    return attendees.filter(
      (a) =>
        a.userId === currentUser.id &&
        (a.attendeeType === 'family_member' || a.attendeeType === 'guest')
    );
  }, [attendees, currentUser]);

  const currentStatus: AttendeeStatus | null = useMemo(() => {
    return primaryAttendee?.rsvpStatus ?? null;
  }, [primaryAttendee]);

  const startDate = useMemo(() => safeToDate((event as any)?.startAt), [event]);
  const endDate = useMemo(() => safeToDate((event as any)?.endAt), [event]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

  const ensurePrimary = useCallback(
    async (status: AttendeeStatus) => {
      if (!eventId || !event || !currentUser) throw new Error('Missing context');

      if (!primaryAttendee) {
        const displayName =
          (currentUser as any)?.displayName ||
          (currentUser as any)?.name ||
          (currentUser as any)?.email ||
          'Me';

        const payload: CreateAttendeeData = {
          eventId,
          userId: currentUser.id,
          attendeeType: 'primary',
          relationship: 'self',
          name: displayName,
          ageGroup: 'adult',
          rsvpStatus: status
        };

        await addAttendee(payload);
        return;
      }

      if (primaryAttendee.rsvpStatus !== status) {
        await updateAttendee(primaryAttendee.attendeeId, { rsvpStatus: status });
      }
    },
    [addAttendee, currentUser, event, eventId, primaryAttendee, updateAttendee]
  );

  const setMyStatus = useCallback(
    async (status: AttendeeStatus) => {
      try {
        setSaving(true);
        await ensurePrimary(status);

        // If user switches to not-going, gently cascade family/guests to not-going
        if (status !== 'going' && myFamilyAndGuests.length) {
          await Promise.all(
            myFamilyAndGuests.map((a) =>
              a.rsvpStatus !== 'not-going'
                ? updateAttendee(a.attendeeId, { rsvpStatus: 'not-going' })
                : Promise.resolve()
            )
          );
        }

        showToast(status === 'going' ? "You're marked as going" : status === 'waitlisted' ? "You're waitlisted" : "You're marked as not going");
      } catch (e: any) {
        console.error(e);
        showToast(e?.message || 'Failed to update RSVP');
      } finally {
        setSaving(false);
      }
    },
    [ensurePrimary, myFamilyAndGuests, showToast, updateAttendee]
  );

  // Add attendee form
  const [newName, setNewName] = useState('');
  const [newRelationship, setNewRelationship] = useState<Relationship>('child');
  const [newAgeGroup, setNewAgeGroup] = useState<AgeGroup>('6-10');
  const [newType, setNewType] = useState<'family_member' | 'guest'>('family_member');

  const canAddMore = useMemo(() => {
    // Keep existing rule-of-thumb: only add when primary is going
    if (currentStatus !== 'going') return false;
    return capacityState.canAddMore || capacityState.canWaitlist;
  }, [capacityState.canAddMore, capacityState.canWaitlist, currentStatus]);

  const addOne = useCallback(async () => {
    if (!eventId || !currentUser) return;
    if (!newName.trim()) return;

    try {
      setSaving(true);
      // Ensure primary exists & is going before adding
      await ensurePrimary('going');

      const payload: CreateAttendeeData = {
        eventId,
        userId: currentUser.id,
        attendeeType: newType,
        relationship: newRelationship,
        name: newName.trim(),
        ageGroup: newAgeGroup,
        rsvpStatus: 'going'
      };

      await addAttendee(payload);
      setNewName('');
      showToast('Added');
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || 'Failed to add attendee');
    } finally {
      setSaving(false);
    }
  }, [addAttendee, currentUser, ensurePrimary, eventId, newAgeGroup, newName, newRelationship, newType, showToast]);

  const quickAddFamily = useCallback(async () => {
    if (!eventId || !currentUser) return;
    if (!familyMembers?.length) return;

    try {
      setSaving(true);
      await ensurePrimary('going');

      // Add family members not already present
      const existingFamilyIds = new Set(
        myFamilyAndGuests
          .filter((a) => a.familyMemberId)
          .map((a) => String(a.familyMemberId))
      );

      const toCreate: CreateAttendeeData[] = familyMembers
        .filter((fm: any) => !existingFamilyIds.has(String(fm.id)))
        .map((fm: any) => ({
          eventId,
          userId: currentUser.id,
          attendeeType: 'family_member',
          relationship: (fm.relationship || 'child') as Relationship,
          name: fm.name || 'Family Member',
          ageGroup: (fm.ageGroup || 'adult') as AgeGroup,
          rsvpStatus: 'going',
          familyMemberId: fm.id
        }));

      if (!toCreate.length) {
        showToast('All family members already added');
        return;
      }

      await bulkAddAttendees(toCreate);
      showToast(`Added ${toCreate.length}`);
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || 'Failed to add family members');
    } finally {
      setSaving(false);
    }
  }, [bulkAddAttendees, currentUser, ensurePrimary, eventId, familyMembers, myFamilyAndGuests, showToast]);

  const removeOne = useCallback(
    async (attendee: Attendee) => {
      try {
        setSaving(true);
        await removeAttendee(attendee.attendeeId);
        showToast('Removed');
      } catch (e: any) {
        console.error(e);
        showToast(e?.message || 'Failed to remove attendee');
      } finally {
        setSaving(false);
      }
    },
    [removeAttendee, showToast]
  );

  const canProceedPayment = useMemo(() => {
    if (!paid) return true;
    // PaymentSection will handle details; we only require primary going
    return currentStatus === 'going';
  }, [currentStatus, paid]);

  const headerStatusChip = useMemo(() => {
    if (currentStatus === 'going') return { label: "You're going", tone: 'good' as const, icon: CheckCircle2 };
    if (currentStatus === 'waitlisted') return { label: "Waitlisted", tone: 'warn' as const, icon: Calendar };
    if (currentStatus === 'not-going') return { label: "Not going", tone: 'muted' as const, icon: XCircle };
    return { label: 'Not responded', tone: 'muted' as const, icon: Calendar };
  }, [currentStatus]);

  const isBusy = saving || loading || attendeesLoading;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-50 to-white">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="h-10 w-40 rounded-xl bg-black/5" />
          <div className="mt-6 h-40 w-full rounded-3xl bg-black/5" />
          <div className="mt-6 h-72 w-full rounded-3xl bg-black/5" />
        </div>
      </div>
    );
  }

  if (error || !event || !eventId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-50 to-white">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <button
            onClick={() => navigate('/events')}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 hover:bg-black/5"
          >
            <ArrowLeft className="h-4 w-4" />
            Events
          </button>

          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
            <div className="text-sm font-semibold">Unable to open RSVP</div>
            <div className="mt-1 text-sm">{error || 'Event not found'}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 to-white">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 hover:bg-black/5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveView('rsvp')}
              className={classNames(
                'rounded-xl px-3 py-2 text-sm font-semibold',
                activeView === 'rsvp' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-black/5'
              )}
            >
              RSVP
            </button>
            <button
              onClick={() => setActiveView('whosgoing')}
              className={classNames(
                'rounded-xl px-3 py-2 text-sm font-semibold',
                activeView === 'whosgoing' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-black/5'
              )}
            >
              Who&apos;s going
            </button>
            {Boolean(isAdmin) && (
              <button
                onClick={() => setActiveView('qr')}
                className={classNames(
                  'rounded-xl px-3 py-2 text-sm font-semibold',
                  activeView === 'qr' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-black/5'
                )}
              >
                QR
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-28 pt-6">
        {/* Event summary card */}
        <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={classNames(
                    pillBase,
                    headerStatusChip.tone === 'good' && 'bg-emerald-50 text-emerald-700 ring-emerald-200',
                    headerStatusChip.tone === 'warn' && 'bg-amber-50 text-amber-700 ring-amber-200',
                    headerStatusChip.tone === 'muted' && 'bg-gray-50 text-gray-700 ring-gray-200'
                  )}
                >
                  <headerStatusChip.icon className="h-4 w-4" />
                  {headerStatusChip.label}
                </span>

                <span className={classNames(pillBase, 'bg-gray-50 text-gray-700 ring-gray-200')}>
                  <Users className="h-4 w-4" />
                  {counts.totalGoing} going
                </span>

                <span className={classNames(pillBase, 'bg-gray-50 text-gray-700 ring-gray-200')}>
                  <DollarSign className="h-4 w-4" />
                  {priceLabel}
                </span>

                {capacityState.state !== 'ok' && (
                  <span className={classNames(pillBase, 'bg-amber-50 text-amber-700 ring-amber-200')}>
                    <AlertTriangle className="h-4 w-4" />
                    {capacityState.slotsRemainingText}
                  </span>
                )}

                {(event as any)?.waitlistEnabled && currentStatus === 'waitlisted' && waitlistPosition ? (
                  <span className={classNames(pillBase, 'bg-amber-50 text-amber-700 ring-amber-200')}>
                    Position #{waitlistPosition}
                  </span>
                ) : null}
              </div>

              <h1 className="mt-3 truncate text-2xl font-semibold text-gray-900 sm:text-3xl">
                {(event as any)?.title || 'Event'}
              </h1>

              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-700 sm:grid-cols-3">
                <div className="inline-flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  {startDate ? safeFormat(startDate, 'EEE, MMM d') : 'TBD'}
                </div>
                <div className="inline-flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  {startDate ? safeFormat(startDate, 'h:mm a') : 'TBD'}
                  {endDate ? ` – ${safeFormat(endDate, 'h:mm a')}` : ''}
                </div>
                <div className="inline-flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-gray-500" />
                  <span className="truncate">{venueLine}</span>
                </div>
              </div>

              {isEventPast && (
                <div className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm text-gray-700 ring-1 ring-inset ring-gray-200">
                  This event has ended. You can still view attendees and details.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Views */}
        <div className="mt-6">
          {activeView === 'whosgoing' && (
            <div className="rounded-3xl border border-black/5 bg-white p-0 shadow-sm">
              <WhosGoingTab event={event} />
            </div>
          )}

          {activeView === 'qr' && Boolean(isAdmin) && (
            <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm sm:p-6">
              <QRCodeTab event={event} />
            </div>
          )}

          {activeView === 'rsvp' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Step 1 */}
              <div className="lg:col-span-2">
                <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Step 1: Choose your RSVP</div>
                      <div className="mt-1 text-sm text-gray-600">
                        Keep it simple—set your status first, then add family/guests if needed.
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <button
                      disabled={isBusy}
                      onClick={() => setMyStatus('going')}
                      className={classNames(
                        'rounded-2xl border px-4 py-4 text-left shadow-sm transition',
                        currentStatus === 'going'
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-black/10 bg-white hover:bg-gray-50'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-900">Going</div>
                        <CheckCircle2 className={classNames('h-5 w-5', currentStatus === 'going' ? 'text-emerald-700' : 'text-gray-400')} />
                      </div>
                      <div className="mt-1 text-xs text-gray-600">I&apos;ll be there</div>
                    </button>

                    <button
                      disabled={isBusy || (!capacityState.canWaitlist && capacityState.isAtCapacity && (event as any)?.waitlistEnabled)}
                      onClick={() => {
                        if ((event as any)?.waitlistEnabled && capacityState.isAtCapacity) setMyStatus('waitlisted');
                        else setMyStatus('going');
                      }}
                      className={classNames(
                        'rounded-2xl border px-4 py-4 text-left shadow-sm transition',
                        currentStatus === 'waitlisted'
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-black/10 bg-white hover:bg-gray-50'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-900">Waitlist</div>
                        <Calendar className={classNames('h-5 w-5', currentStatus === 'waitlisted' ? 'text-amber-700' : 'text-gray-400')} />
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        {((event as any)?.waitlistEnabled && capacityState.isAtCapacity)
                          ? 'Join the waitlist'
                          : 'If event is full'}
                      </div>
                    </button>

                    <button
                      disabled={isBusy}
                      onClick={() => setMyStatus('not-going')}
                      className={classNames(
                        'rounded-2xl border px-4 py-4 text-left shadow-sm transition',
                        currentStatus === 'not-going'
                          ? 'border-gray-200 bg-gray-50'
                          : 'border-black/10 bg-white hover:bg-gray-50'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-900">Not going</div>
                        <XCircle className={classNames('h-5 w-5', currentStatus === 'not-going' ? 'text-gray-700' : 'text-gray-400')} />
                      </div>
                      <div className="mt-1 text-xs text-gray-600">Can&apos;t make it</div>
                    </button>
                  </div>

                  {attendeesError && (
                    <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                      {attendeesError}
                    </div>
                  )}

                  {/* Step 2 */}
                  <div className="mt-8 border-t border-black/5 pt-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">Step 2: Add family or guests (optional)</div>
                        <div className="mt-1 text-sm text-gray-600">
                          Available after you set yourself as <span className="font-semibold">Going</span>.
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <LoadingButton
                          onClick={quickAddFamily}
                          loading={saving}
                          disabled={!familyMembers?.length || currentStatus !== 'going' || isEventPast}
                          className="rounded-xl"
                        >
                          Add saved family
                        </LoadingButton>
                      </div>
                    </div>

                    {currentStatus !== 'going' && (
                      <div className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm text-gray-700 ring-1 ring-inset ring-gray-200">
                        Set your RSVP to <span className="font-semibold">Going</span> to add family members or guests.
                      </div>
                    )}

                    {currentStatus === 'going' && (
                      <>
                        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-6">
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Type
                            </label>
                            <select
                              value={newType}
                              onChange={(e) => setNewType(e.target.value as any)}
                              className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                            >
                              <option value="family_member">Family member</option>
                              <option value="guest">Guest</option>
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Relationship
                            </label>
                            <select
                              value={newRelationship}
                              onChange={(e) => setNewRelationship(e.target.value as any)}
                              className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                            >
                              <option value="spouse">Spouse</option>
                              <option value="child">Child</option>
                              <option value="guest">Guest</option>
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Age group
                            </label>
                            <select
                              value={newAgeGroup}
                              onChange={(e) => setNewAgeGroup(e.target.value as any)}
                              className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                            >
                              <option value="0-2">0–2</option>
                              <option value="3-5">3–5</option>
                              <option value="6-10">6–10</option>
                              <option value="11+">11+</option>
                              <option value="adult">Adult</option>
                            </select>
                          </div>

                          <div className="sm:col-span-4">
                            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Name
                            </label>
                            <input
                              value={newName}
                              onChange={(e) => setNewName(e.target.value)}
                              placeholder="e.g., Vihaan"
                              className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                            />
                          </div>

                          <div className="sm:col-span-2 sm:flex sm:items-end">
                            <LoadingButton
                              onClick={addOne}
                              loading={saving}
                              disabled={!newName.trim() || !canAddMore || isEventPast}
                              className="w-full rounded-xl"
                            >
                              Add
                            </LoadingButton>
                          </div>
                        </div>

                        <div className="mt-6">
                          <div className="text-sm font-semibold text-gray-900">Your attendees</div>
                          <div className="mt-3 space-y-2">
                            {myFamilyAndGuests.length === 0 && (
                              <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-700 ring-1 ring-inset ring-gray-200">
                                No additional attendees yet.
                              </div>
                            )}

                            {myFamilyAndGuests.map((a) => (
                              <div
                                key={a.attendeeId}
                                className="flex items-center justify-between rounded-2xl border border-black/10 bg-white px-4 py-3"
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-gray-900">{a.name}</div>
                                  <div className="mt-0.5 text-xs text-gray-600">
                                    {a.attendeeType === 'guest' ? 'Guest' : 'Family'} • {a.relationship} • {a.ageGroup}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() =>
                                      updateAttendee(a.attendeeId, {
                                        rsvpStatus: a.rsvpStatus === 'going' ? 'not-going' : 'going'
                                      })
                                    }
                                    disabled={saving || isEventPast}
                                    className={classNames(
                                      'rounded-xl px-3 py-2 text-xs font-semibold ring-1 ring-inset transition',
                                      a.rsvpStatus === 'going'
                                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100'
                                        : 'bg-gray-50 text-gray-700 ring-gray-200 hover:bg-gray-100'
                                    )}
                                  >
                                    {a.rsvpStatus === 'going' ? 'Going' : 'Not going'}
                                  </button>

                                  <button
                                    onClick={() => removeOne(a)}
                                    disabled={saving || isEventPast}
                                    className="rounded-xl px-3 py-2 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Step 3 */}
                  <div className="mt-8 border-t border-black/5 pt-6">
                    <div className="text-sm font-semibold text-gray-900">Step 3: Payment & confirmation</div>
                    <div className="mt-1 text-sm text-gray-600">
                      {paid ? 'Complete payment (if required) to confirm your spot.' : 'No payment required.'}
                    </div>

                    {paid && currentStatus !== 'going' && (
                      <div className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm text-gray-700 ring-1 ring-inset ring-gray-200">
                        Set your RSVP to <span className="font-semibold">Going</span> to proceed to payment.
                      </div>
                    )}

                    <div className="mt-5">
                      <PaymentSection
                        event={event}
                        attendees={myAttendees}
                        onPaymentComplete={() => showToast('Payment updated')}
                        onPaymentError={(msg) => showToast(msg)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right rail */}
              <div className="lg:col-span-1">
                <div className="sticky top-24 space-y-4">
                  <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm sm:p-6">
                    <div className="text-sm font-semibold text-gray-900">Summary</div>
                    <div className="mt-3 space-y-2 text-sm text-gray-700">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">You</span>
                        <span className="font-semibold">{currentStatus || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Additional</span>
                        <span className="font-semibold">{myFamilyAndGuests.filter(a => a.rsvpStatus === 'going').length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Price</span>
                        <span className="font-semibold">{priceLabel}</span>
                      </div>
                    </div>

                    <div className="mt-5 rounded-2xl bg-gray-50 p-4 text-xs text-gray-600 ring-1 ring-inset ring-gray-200">
                      Tip: After you RSVP "Going", add family/guests if needed.
                    </div>
                  </div>

                  <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm sm:p-6">
                    <div className="text-sm font-semibold text-gray-900">Capacity</div>
                    <div className="mt-2 text-sm text-gray-700">
                      {capacityState.warningMessage || capacityState.slotsRemainingText}
                    </div>
                    {(event as any)?.maxAttendees ? (
                      <div className="mt-4 h-2 w-full rounded-full bg-gray-100">
                        <div
                          className="h-2 rounded-full bg-gray-900"
                          style={{ width: `${Math.min(100, Math.max(0, capacityState.capacityPercentage))}%` }}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-gray-900">
              {activeView === 'rsvp' ? 'RSVP' : activeView === 'whosgoing' ? "Who's going" : 'QR'}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {counts.totalGoing} going
              </span>
              <span className="inline-flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                {priceLabel}
              </span>
            </div>
          </div>

          <LoadingButton
            onClick={() => navigate(`/events-v2/${eventId}`)}
            loading={false}
            className="shrink-0 rounded-2xl"
          >
            View details
          </LoadingButton>
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-2xl bg-gray-900 px-4 py-2 text-sm text-white shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RSVPPageV2;

