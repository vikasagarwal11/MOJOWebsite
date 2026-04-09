import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Calendar, ChevronDown, Clock, MapPin, UserPlus, Users } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EventDoc } from '../hooks/useEvents';
import { Relationship } from '../types/attendee';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';
import { db } from '../config/firebase';
import { Helmet } from 'react-helmet-async';
import { createEventCanonicalUrl } from '../utils/seo';
import { PaymentSection } from '../components/events/PaymentSection';

const GuestRSVPPage: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEventDetailsCollapsed, setIsEventDetailsCollapsed] = useState(false);
  
  type GuestAttendeeRow = { id: string; name: string; relationship: Relationship };
  
  const makeId = () => (globalThis as any).crypto?.randomUUID ? (globalThis as any).crypto.randomUUID() : Math.random().toString(36).slice(2);
  
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestCountryCode, setGuestCountryCode] = useState<'+1' | '+91'>('+1');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestRows, setGuestRows] = useState<GuestAttendeeRow[]>([{ id: makeId(), name: '', relationship: 'guest' }]);
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const [guestSubmitted, setGuestSubmitted] = useState(false);
  const [guestMemberExists, setGuestMemberExists] = useState(false);
  const [isAddSectionCollapsed, setIsAddSectionCollapsed] = useState(false);
  const [showGuestRsvpModal, setShowGuestRsvpModal] = useState(false);

  useEffect(() => {
    if (!eventId) {
      setError('Event ID not provided');
      setLoading(false);
      return;
    }

    const eventRef = doc(db, 'events', eventId);
    const unsubscribe = onSnapshot(eventRef, (eventSnap) => {
      if (eventSnap.exists()) {
        const eventData = eventSnap.data();
        const loadedEvent = { id: eventSnap.id, ...eventData } as EventDoc;
        setEvent(loadedEvent);
        setError(null);
      } else {
        setError('Event not found');
      }
      setLoading(false);
    }, (err) => {
      console.error('GuestRSVPPage: Error fetching event:', err);
      setError('Failed to load event details');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [eventId]);

  const addGuestRow = useCallback(() => {
    setGuestRows((prev) => [...prev, { id: makeId(), name: '', relationship: 'guest' }]);
  }, []);

  const addFamilyRow = useCallback(() => {
    setGuestRows((prev) => [...prev, { id: makeId(), name: '', relationship: 'spouse' }]);
  }, []);

  const removeGuestRow = useCallback((id: string) => {
    setGuestRows((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
  }, []);

  const updateGuestRowField = useCallback((id: string, field: keyof GuestAttendeeRow, value: string) => {
    setGuestRows((prev) => prev.map((row) => (row.id === id ? ({ ...row, [field]: value } as GuestAttendeeRow) : row)));
  }, []);

  const resetGuestForm = useCallback(() => {
    setGuestFirstName('');
    setGuestLastName('');
    setGuestEmail('');
    setGuestCountryCode('+1');
    setGuestPhone('');
    setGuestRows([{ id: makeId(), name: '', relationship: 'guest' }]);
    setGuestMemberExists(false);
  }, []);

  const handleSubmitGuestRsvp = useCallback(async () => {
    if (!event?.id) return;

    const firstName = guestFirstName.trim();
    const lastName = guestLastName.trim();
    const email = guestEmail.trim().toLowerCase();
    const normalizeGuestPhoneToE164OrNull = (input: string): string | null => {
      const raw = (input || '').trim();
      if (!raw) return null;

      if (raw.startsWith('+')) {
        const cleaned = raw.replace(/[^\d+]/g, '');
        return /^\+[1-9]\d{6,14}$/.test(cleaned) ? cleaned : null;
      }

      const digits = raw.replace(/\D/g, '');
      if (!digits) return null;

      if (guestCountryCode === '+1') {
        if (digits.length === 10) return `+1${digits}`;
        if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
        return null;
      }

      if (guestCountryCode === '+91') {
        if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
        if (digits.length === 12 && digits.startsWith('91') && /^[6-9]\d{9}$/.test(digits.slice(2))) return `+${digits}`;
        return null;
      }

      return null;
    };

    const phoneE164 = normalizeGuestPhoneToE164OrNull(guestPhone);
    const additionalAttendees = guestRows.map((row) => ({ name: row.name.trim(), relationship: (row.relationship || 'guest') as Relationship })).filter((row) => row.name.length > 0);

    if (!firstName || !lastName) {
      toast.error('First and last name are required');
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (!phoneE164) {
      toast.error(`Please enter a valid ${guestCountryCode} phone number`);
      return;
    }

    try {
      setGuestSubmitting(true);
      setGuestMemberExists(false);
      const fn = httpsCallable<{ eventId: string; guest: { firstName: string; lastName: string; email: string; phoneNumber: string }; additionalAttendees: Array<{ name: string; relationship: string }> }, { success: boolean; memberExists?: boolean; message?: string; error?: string }>(getFunctions(), 'submitTrulyPublicGuestRsvp');

      const result = await fn({ eventId: event.id, guest: { firstName, lastName, email, phoneNumber: phoneE164 }, additionalAttendees });

      if (!result.data?.success) {
        if (result.data?.memberExists) {
          setGuestMemberExists(true);
          toast.error(result.data?.message || 'You are already a member. Please login.');
          return;
        }
        toast.error(result.data?.error || result.data?.message || 'Unable to submit RSVP');
        return;
      }

      setGuestSubmitted(true);
      toast.success(result.data?.message || 'RSVP submitted');
      setShowGuestRsvpModal(false);
      resetGuestForm();
    } catch (err: any) {
      console.error('Failed to submit guest RSVP:', err);
      const errorMsg = err?.message || 'Unable to submit RSVP';
      if (errorMsg.includes('CORS') || errorMsg.includes('internal')) {
        toast.error('Server configuration error. Please contact support.');
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setGuestSubmitting(false);
    }
  }, [event?.id, guestCountryCode, guestEmail, guestFirstName, guestLastName, guestPhone, guestRows, resetGuestForm]);

  const guestReadyToAddCount = useMemo(() => guestRows.filter((row) => row.name.trim()).length, [guestRows]);
  const guestFamilyCount = useMemo(
    () => guestRows.filter((row) => row.name.trim() && row.relationship !== 'guest').length,
    [guestRows]
  );
  const guestOnlyCount = useMemo(
    () => guestRows.filter((row) => row.name.trim() && row.relationship === 'guest').length,
    [guestRows]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F25129] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading event...</p>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Event Not Found</h2>
          <p className="text-gray-600 mb-4">{error || 'The event you are looking for does not exist.'}</p>
          <button onClick={() => navigate('/events')} className="px-4 py-2 bg-[#F25129] text-white rounded-md hover:bg-[#E0451F] transition-colors">Back to Events</button>
        </div>
      </div>
    );
  }

  const canonicalUrl = event ? createEventCanonicalUrl(event) : '';

  return (
    <>
      {canonicalUrl && (<Helmet><link rel="canonical" href={canonicalUrl} /></Helmet>)}
      
      <div className="min-h-screen bg-gray-50">
        <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-2xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3"></div>
        </div>

        <div className="max-w-2xl mx-auto px-4">
          <div className="text-center mb-6 sm:mb-8 pt-6 sm:pt-8">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent leading-relaxed pb-1">{event.title}</h1>
          </div>

          <div className="mb-4">
            <div className="bg-gradient-to-br from-[#FFF5F2] to-[#FFE08A]/30 border border-[#F25129]/20 rounded-lg overflow-hidden">
              <motion.button onClick={() => setIsEventDetailsCollapsed((v) => !v)} className="w-full p-3 sm:p-4 flex items-center justify-between touch-manipulation active:bg-[#F25129]/5 cursor-pointer" aria-expanded={!isEventDetailsCollapsed}>
                <div className="flex items-center gap-2 sm:gap-3 flex-1">
                  <div className="p-1.5 sm:p-2 bg-white rounded-lg shadow-sm"><Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-[#F25129]" /></div>
                  <div className="text-left flex-1">
                    <h4 className="font-semibold text-gray-900 text-xs sm:text-sm">Event Details</h4>
                    {event.startAt && (<span className="text-xs text-[#F25129] font-medium">{new Date(event.startAt.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{event.startAt && (` at ${new Date(event.startAt.seconds * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`)}</span>)}
                  </div>
                </div>
                <motion.div animate={{ rotate: isEventDetailsCollapsed ? 0 : 180 }} transition={{ duration: 0.3 }}><ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-[#F25129]" /></motion.div>
              </motion.button>

              {!isEventDetailsCollapsed && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }} className="border-t border-blue-200">
                  <div className="bg-white rounded-b-lg p-4 sm:p-5">
                    <div className="space-y-3">
                      {event.startAt && (<div className="flex items-start gap-3"><div className="p-2 bg-[#F25129]/10 rounded-lg flex-shrink-0 shadow-sm"><Calendar className="w-5 h-5 text-[#F25129]" /></div><div className="flex-1 min-w-0"><div className="font-semibold text-gray-900 break-words">{new Date(event.startAt.seconds * 1000).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div></div></div>)}
                      {event.startAt && (<div className="flex items-start gap-3"><div className="p-2 bg-[#FFC107]/20 rounded-lg flex-shrink-0 shadow-sm"><Clock className="w-5 h-5 text-[#FFC107]" /></div><div className="flex-1 min-w-0"><div className="font-semibold text-gray-900 break-words">{new Date(event.startAt.seconds * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}{event.endAt && ` - ${new Date(event.endAt.seconds * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`}</div></div></div>)}
                      {(event.venueName || event.venueAddress || event.location) && (<div className="flex items-start gap-3"><div className="p-2 bg-[#F25129]/10 rounded-lg flex-shrink-0 shadow-sm"><MapPin className="w-5 h-5 text-[#F25129]" /></div><div className="flex-1 min-w-0"><div className="font-semibold text-gray-900 break-words">{event.location || (event.venueName && event.venueAddress ? `${event.venueName}, ${event.venueAddress}` : event.venueName || event.venueAddress || '')}</div></div></div>)}
                      {event.description && (<div className="pt-3 border-t border-gray-200"><div className="font-semibold text-gray-900 text-xs uppercase tracking-wide mb-2">DESCRIPTION</div><p className="text-sm text-gray-700 leading-relaxed break-words whitespace-pre-wrap">{event.description}</p></div>)}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          <div className="bg-white border-b border-gray-200">
            <div className="max-w-2xl mx-auto px-4 flex">
              <button className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-semibold text-[#F25129] border-b-2 border-[#F25129] bg-orange-50/30"><Users className="w-4 h-4 sm:w-5 sm:h-5" /><span>Guest RSVP</span></button>
            </div>
          </div>

          <div className="bg-white">
            <div className="max-w-2xl mx-auto px-4">
              <div className="px-4 py-4">
                {/* Payment Section - Empty attendees array for guest users */}
                <PaymentSection 
                  event={event}
                  attendees={[]}
                  onPaymentComplete={() => {}}
                  onPaymentError={(error) => console.error('Payment error:', error)}
                />

                {/* Add Yourself Section - Collapsible */}
                <div className="bg-orange-50 border border-orange-200 rounded-lg mb-3 sm:mb-4">
                  <motion.button
                    onClick={() => setIsAddSectionCollapsed((v) => !v)}
                    className="w-full p-3 sm:p-4 flex items-center justify-between touch-manipulation active:bg-orange-100 cursor-pointer"
                    aria-expanded={!isAddSectionCollapsed}
                  >
                    <div className="flex items-center gap-2 sm:gap-3 flex-1">
                      <div className="p-1.5 sm:p-2 bg-white rounded-lg shadow-sm">
                        <UserPlus className="w-4 h-4 sm:w-5 sm:h-5 text-[#F25129]" />
                      </div>
                      <div className="text-left flex-1">
                        <h4 className="font-semibold text-xs sm:text-sm text-gray-900">Add Yourself</h4>
                        {guestReadyToAddCount > 0 && (
                          <span className="text-xs text-orange-600 font-medium">{guestReadyToAddCount} ready to add</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isAddSectionCollapsed && (
                        <button
                          onClick={(e) => { e.stopPropagation(); addGuestRow(); }}
                          className="text-xs sm:text-sm text-[#F25129] hover:text-[#E0451F] font-medium transition-colors touch-manipulation"
                        >
                          Add a row
                        </button>
                      )}
                      <motion.div animate={{ rotate: isAddSectionCollapsed ? 0 : 180 }} transition={{ duration: 0.3 }}>
                        <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-[#F25129]" />
                      </motion.div>
                    </div>
                  </motion.button>

                  <AnimatePresence>
                    {!isAddSectionCollapsed && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="p-4 pt-2">
                          {guestSubmitted ? (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                              <p className="text-sm text-emerald-700 font-medium">✓ RSVP submitted successfully! We'll contact you with event details.</p>
                            </div>
                          ) : guestMemberExists ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                              <p className="text-sm text-amber-700 font-medium">You are already a member. Please login to RSVP.</p>
                              <button type="button" onClick={() => navigate('/login')} className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">Go to Login</button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                                <p className="text-xs font-semibold text-blue-800">Simple RSVP Flow</p>
                                <p className="mt-1 text-xs text-blue-700">Step 1 add your info, Step 2 add attendees (optional), Step 3 submit.</p>
                              </div>

                              <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
                                <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">1. Your details</div>
                                <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-600">2. Additional attendees</div>
                                <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-600">3. Submit RSVP</div>
                              </div>

                              <div className="rounded-lg border border-gray-200 bg-white p-3">
                                <h4 className="mb-2 text-sm font-semibold text-gray-900">Step 1: Your details</h4>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div><label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label><input value={guestFirstName} onChange={(e) => setGuestFirstName(e.target.value)} placeholder="First name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label><input value={guestLastName} onChange={(e) => setGuestLastName(e.target.value)} placeholder="Last name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
                              </div>
                              <div><label className="block text-sm font-medium text-gray-700 mb-1">Email *</label><input value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="Email address" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                                <div className="flex gap-2">
                                  <select value={guestCountryCode} onChange={(e) => setGuestCountryCode(e.target.value as '+1' | '+91')} className="rounded-lg border border-gray-300 px-2 py-2 text-sm">
                                    <option value="+1">+1 (US)</option>
                                    <option value="+91">+91 (India)</option>
                                  </select>
                                  <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder={guestCountryCode === '+91' ? '98765 43210' : '201 555 0123'} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                                </div>
                                <p className="mt-1 text-[11px] text-gray-500">Country code will be sent as {guestCountryCode}</p>
                              </div>
                              </div>

                              <div className="rounded-lg border border-gray-200 p-3">
                                <div className="mb-2 flex items-center justify-between"><h4 className="text-sm font-semibold text-gray-900">Step 2: Additional Attendees (Optional)</h4></div>
                                <div className="mb-2 flex flex-wrap gap-2">
                                  <button type="button" onClick={addFamilyRow} className="rounded-md border border-[#F25129]/30 bg-[#FFF6F2] px-2.5 py-1.5 text-xs font-semibold text-[#C74221] hover:bg-[#FFEDE5]">+ Add Family Member</button>
                                  <button type="button" onClick={addGuestRow} className="rounded-md border border-[#FFC107]/40 bg-[#FFF9E6] px-2.5 py-1.5 text-xs font-semibold text-[#9A6A00] hover:bg-[#FFF2C2]">+ Add Guest</button>
                                </div>
                                <div className="mb-2 text-[11px] text-gray-600">Added: {guestReadyToAddCount} total ({guestFamilyCount} family, {guestOnlyCount} guest)</div>
                                <div className="space-y-2">
                                  {guestRows.map((row) => (
                                    <div key={row.id} className="grid grid-cols-1 gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2 sm:grid-cols-6">
                                      <input value={row.name} onChange={(e) => updateGuestRowField(row.id, 'name', e.target.value)} placeholder="Member name" className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-4" />
                                      <select value={row.relationship} onChange={(e) => updateGuestRowField(row.id, 'relationship', e.target.value)} className="rounded-lg border border-gray-300 px-2 py-2 text-sm sm:col-span-1"><option value="guest">Guest</option><option value="spouse">Spouse</option><option value="child">Child</option></select>
                                      <button type="button" onClick={() => removeGuestRow(row.id)} className="rounded-lg border border-gray-200 px-2 py-2 text-xs text-gray-700 hover:bg-gray-50 sm:col-span-1">Remove</button>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="rounded-lg border border-[#F25129]/20 bg-[#FFF7F3] p-3">
                                <p className="mb-2 text-xs font-semibold text-[#C74221]">Step 3: Final confirmation</p>
                                <button type="button" onClick={handleSubmitGuestRsvp} disabled={guestSubmitting} className="w-full px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm font-bold bg-gradient-to-r from-[#F25129] to-[#E0451F] text-white rounded-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-transform touch-manipulation">{guestSubmitting ? 'Submitting...' : `Submit RSVP for ${1 + guestReadyToAddCount} attendee(s)`}</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default GuestRSVPPage;
