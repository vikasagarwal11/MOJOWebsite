import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, CalendarCheck, CheckCircle, Clock, DollarSign, MapPin, Tag, Users, XCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EventImage } from '../components/events/EventImage';
import { EventSeo } from '../components/seo/EventSeo';
import { auth, db } from '../config/firebase';
import { EventDoc } from '../hooks/useEvents';
import { safeFormat, safeToDate } from '../utils/dateUtils';
import { createEventCanonicalUrl } from '../utils/seo';

const EventDetailsPage: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userAttendee, setUserAttendee] = useState<any>(null);

  useEffect(() => {
    if (!eventId) {
      setError('Event ID not provided');
      setLoading(false);
      return;
    }

    const eventRef = doc(db, 'events', eventId);
    
    // Real-time listener for live updates
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
        console.error('Error fetching event:', err);
        setError('Failed to load event details');
        setLoading(false);
      }
    );

    // Cleanup listener on unmount
    return () => unsubscribe();
  }, [eventId]);

  // Fetch user's attendee record for payment status
  useEffect(() => {
    if (!eventId) {
      setUserAttendee(null);
      return;
    }

    // Use auth state listener to ensure we have current user
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
          const attendeeData = { id: attendeeDoc.id, ...attendeeDoc.data() };
          console.log('User attendee data:', attendeeData);
          setUserAttendee(attendeeData);
        } else {
          console.log('No attendee record found for user');
          setUserAttendee(null);
        }
      }, (error) => {
        console.error('Error fetching attendee:', error);
        setUserAttendee(null);
      });

      return unsubscribeSnapshot;
    });

    return () => unsubscribeAuth();
  }, [eventId]);

  // Helper functions
  const getEventStatus = (event: EventDoc): { status: string; color: string; bgColor: string } => {
    // If status is not "scheduled" → Closed
    if (event.status && event.status !== 'scheduled') {
      return { status: 'Closed', color: 'text-gray-800', bgColor: 'bg-gray-100' };
    }
    
    // If attendingCount >= capacity → Sold Out
    if (event.maxAttendees && event.attendingCount && event.attendingCount >= event.maxAttendees) {
      return { status: 'Sold Out', color: 'text-red-800', bgColor: 'bg-red-100' };
    }
    
    // If waitlistCount > 0 → Waitlist
    if (event.waitlistCount && event.waitlistCount > 0) {
      return { status: 'Waitlist', color: 'text-yellow-800', bgColor: 'bg-yellow-100' };
    }
    
    // Else → Open
    return { status: 'Open', color: 'text-green-800', bgColor: 'bg-green-100' };
  };

  const formatEventDate = (date: any) => {
    try {
      const dateObj = safeToDate(date);
      return safeFormat(dateObj, 'EEEE, MMMM d, yyyy');
    } catch (error) {
      return 'Date TBD';
    }
  };

  const formatEventTime = (date: any) => {
    try {
      const dateObj = safeToDate(date);
      return safeFormat(dateObj, 'h:mm a');
    } catch (error) {
      return 'Time TBD';
    }
  };

  const getEventDuration = () => {
    if (!event?.startAt || !event?.endAt) return null;
    try {
      const start = safeToDate(event.startAt);
      const end = safeToDate(event.endAt);
      const diffMs = end.getTime() - start.getTime();
      const diffHours = Math.round(diffMs / (1000 * 60 * 60));
      return diffHours;
    } catch (error) {
      return null;
    }
  };

  const getDisplayVenueInfo = (venueName: string, venueAddress: string) => {
    if (venueName && venueAddress) {
      return `${venueName}, ${venueAddress}`;
    }
    return venueName || venueAddress || '';
  };

  const getLocationForMaps = () => {
    return event?.location || getDisplayVenueInfo(event?.venueName || '', event?.venueAddress || '');
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F25129]"></div>
          </div>
        </div>
      </div>
    );
  }

  const handleBack = () => {
    try {
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate('/events');
      }
    } catch (err) {
      navigate('/events');
    }
  };

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Event Not Found</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={handleBack}
              className="inline-flex items-center px-6 py-3 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] transition-colors duration-200"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Events
            </button>
          </div>
        </div>
      </div>
    );
  }

  const eventStatus = getEventStatus(event);
  const duration = getEventDuration();
  const canonicalUrl = createEventCanonicalUrl(event);

  return (
    <>
      {/* SEO: Event Structured Data, Meta Tags, and Canonical URL */}
      <EventSeo 
        event={event} 
        canonicalUrl={canonicalUrl}
      />
      
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
        {/* Layout optimizations: Reduced padding from py-8 sm:py-12 to py-4 sm:py-6 for better space usage */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          {/* Back Button - Spacing optimized: mb-6 changed to mb-4, page title "Event Details" removed */}
          <div className="mb-4">
            <button
              onClick={() => navigate('/events')}
              className="flex items-center gap-2 text-gray-600 hover:text-[#F25129] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Back to Events</span>
            </button>
          </div>
          
          {/* Professional Two-Column Layout */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-white rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
              {/* Left Column - Image */}
              <div className="relative bg-gradient-to-br from-gray-100 to-gray-200 h-64 sm:h-96 lg:min-h-[700px]">
                <div className="absolute inset-0">
                  <EventImage 
                    src={event.imageUrl} 
                    alt={event.title} 
                    fit="cover" 
                    aspect="16/9"
                    title={event.title}
                    loading="eager"
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Gradient Overlay for better badge visibility */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-transparent pointer-events-none"></div>
                {/* Status Badge */}
                <div className="absolute top-6 left-6 z-10">
                  <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-bold shadow-lg backdrop-blur-sm ${eventStatus.bgColor} ${eventStatus.color} border-2 border-white/20`}>
                    {eventStatus.status}
                  </span>
                </div>
              </div>

              {/* Right Column - Content */}
              <div className="p-6 sm:p-8 lg:p-10">
            {/* Title */}
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 leading-tight">{event.title}</h1>

            {/* Description */}
            {event.description && (
              <p className="text-base text-gray-700 leading-relaxed mb-6">{event.description}</p>
            )}

            {/* User RSVP Status Card - Show if user has RSVP'd
                Change: Removed "Update RSVP" button - now only displays status (going/not going/waitlisted)
            */}
            {userAttendee && (
              <div className={`mb-6 p-4 rounded-lg border-2 ${
                userAttendee.rsvpStatus === 'going' 
                  ? 'bg-green-50 border-green-200' 
                  : userAttendee.rsvpStatus === 'waitlisted'
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                    userAttendee.rsvpStatus === 'going'
                      ? 'bg-green-100'
                      : userAttendee.rsvpStatus === 'waitlisted'
                      ? 'bg-amber-100'
                      : 'bg-gray-100'
                  }`}>
                    {userAttendee.rsvpStatus === 'going' ? (
                      <CheckCircle className={`w-6 h-6 ${
                        userAttendee.rsvpStatus === 'going' ? 'text-green-600' : 'text-gray-600'
                      }`} />
                    ) : (
                      <XCircle className="w-6 h-6 text-gray-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className={`text-base font-bold ${
                        userAttendee.rsvpStatus === 'going'
                          ? 'text-green-800'
                          : userAttendee.rsvpStatus === 'waitlisted'
                          ? 'text-amber-800'
                          : 'text-gray-800'
                      }`}>
                        {userAttendee.rsvpStatus === 'going' && 'You\'re Attending!'}
                        {userAttendee.rsvpStatus === 'waitlisted' && 'You\'re Waitlisted'}
                        {userAttendee.rsvpStatus === 'not-going' && 'Not Attending'}
                      </h3>
                    </div>
                    
                    {/* Payment Status for paid events */}
                    {event.pricing?.requiresPayment && userAttendee.rsvpStatus === 'going' && (
                      <div className="mt-2 flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-gray-600" />
                        <span className={`text-sm font-semibold ${
                          userAttendee.paymentStatus === 'paid'
                            ? 'text-green-700'
                            : 'text-amber-700'
                        }`}>
                          {userAttendee.paymentStatus === 'paid' ? 'Payment Complete' : 'Payment Pending'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Event Details Grid 
                Optimizations: Reduced spacing (space-y-3 to space-y-2), card padding (p-3 to p-2.5),
                icon sizes (w-10 h-10 to w-9 h-9, w-5 h-5 to w-4 h-4), gap (gap-3 to gap-2.5)
                Changes: Combined Date and Time into single card, changed "Event Support:" to "Event Support Amt:"
            */}
            <div className="space-y-2 mb-4">
              {/* Date & Time - Combined into single card (previously separate cards) */}
              <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100">
                <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-white shadow-sm">
                  <Calendar className="w-4 h-4 text-[#F25129]" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-gray-500 font-medium mb-0.5">Date & Time</div>
                  <div className="font-semibold text-gray-900 text-sm">
                    {formatEventDate(event.startAt)} • {formatEventTime(event.startAt)}
                    {event.endAt && ` - ${formatEventTime(event.endAt)}`}
                    {duration && <span className="text-gray-500 text-xs font-normal ml-1">({duration} hour{duration !== 1 ? 's' : ''})</span>}
                  </div>
                </div>
              </div>

              {/* Location - Clickable for Directions */}
              {(event.venueName || event.venueAddress || event.location) && (
                <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100">
                  <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-white shadow-sm">
                    <MapPin className="w-4 h-4 text-[#F25129]" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-gray-500 font-medium mb-0.5">Location</div>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location || getDisplayVenueInfo(event.venueName || '', event.venueAddress || ''))}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-[#F25129] hover:text-[#E0451F] hover:underline transition-colors text-sm break-words"
                    >
                      {event.location || getDisplayVenueInfo(event.venueName || '', event.venueAddress || '')}
                    </a>
                  </div>
                </div>
              )}

              {/* Attendee Count */}
              {event.maxAttendees && (
                <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100">
                  <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-white shadow-sm">
                    <Users className="w-4 h-4 text-[#F25129]" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-gray-500 font-medium mb-0.5">Capacity</div>
                    <div className="font-semibold text-gray-900 text-sm">
                      {event.attendingCount || 0}/{event.maxAttendees}
                    </div>
                    {/* Only show waitlist if waitlist is enabled */}
                    {event.waitlistEnabled && (
                      <div className="text-xs text-amber-600 font-medium mt-0.5">
                        {event.waitlistCount || 0} waitlisted
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Price Information */}
              {event.pricing && (
                <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100">
                  <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-white shadow-sm">
                    <Tag className="w-4 h-4 text-[#F25129]" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-gray-500 font-medium mb-0.5">Price</div>
                    <div className="text-base font-bold text-[#F25129]">
                      {event.pricing.adultPrice ? `$${(event.pricing.adultPrice / 100).toFixed(2)}` : 'Free'}
                    </div>
                    {event.pricing.childPrice && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        Child: ${(event.pricing.childPrice / 100).toFixed(2)}
                      </div>
                    )}
                    {event.pricing.eventSupportAmount && event.pricing.eventSupportAmount > 0 && (
                      <div className="text-xs text-gray-600 mt-0.5 font-medium">
                        Event Support Amt: ${(event.pricing.eventSupportAmount / 100).toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Refund Deadline - Only show if refunds allowed and deadline is set */}
              {event.pricing && event.pricing.refundPolicy?.allowed && event.pricing.refundPolicy?.deadline && (
                <div className="flex items-center">
                  <div>
                    <div className="text-sm font-medium text-gray-700">Refund Deadline</div>
                    <div className="text-sm text-gray-600">
                      {safeFormat(safeToDate(event.pricing.refundPolicy.deadline), 'MMM d, yyyy')}
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Status - Only show for paid events and if user has RSVP'd */}
              {event.pricing && event.pricing.requiresPayment && userAttendee && userAttendee.status === 'going' && (
                <div className="flex items-center">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-gray-700">Payment Status</span>
                    <span className={`px-3 py-1.5 rounded-full text-sm font-semibold inline-flex items-center gap-1.5 ${
                      userAttendee.paymentStatus === 'paid'
                        ? 'bg-green-100 text-green-700 border border-green-300'
                        : 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                    }`}>
                      {userAttendee.paymentStatus === 'paid' ? '✓ Payment Successful' : '⏳ Payment Pending'}
                    </span>
                  </div>
                </div>
              )}
              
              {/* Debug: Show what we have */}
              {process.env.NODE_ENV === 'development' && userAttendee && (
                <div className="col-span-2 p-3 bg-gray-100 rounded text-xs">
                  <div><strong>Debug Info:</strong></div>
                  <div>User Attendee ID: {userAttendee.id}</div>
                  <div>Status: {userAttendee.status}</div>
                  <div>Payment Status: {userAttendee.paymentStatus || 'undefined'}</div>
                  <div>Requires Payment: {event.pricing?.requiresPayment ? 'Yes' : 'No'}</div>
                </div>
              )}
            </div>

            {/* Tags */}
            {event.tags && event.tags.length > 0 && (
              <div className="pt-6 border-t border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="w-4 h-4 text-[#F25129]" />
                  <h3 className="text-base font-semibold text-gray-900">Categories</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {event.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 border border-purple-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* RSVP Button - Changes based on RSVP status */}
            <div className="pt-6 mt-6 border-t border-gray-200">
              <button
                onClick={() => navigate(`/events/${eventId}/rsvp`)}
                className={`group w-full flex items-center justify-center gap-2 px-6 py-3 font-semibold text-base rounded-lg shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-95 transition-all duration-200 ${
                  userAttendee 
                    ? 'bg-gradient-to-r from-green-500 to-green-600 text-white' 
                    : 'bg-gradient-to-r from-[#F25129] to-[#E0451F] text-white'
                }`}
              >
                <CalendarCheck className="w-5 h-5 group-hover:rotate-12 transition-transform duration-300" />
                <span>{userAttendee ? 'Edit RSVP' : 'RSVP Now'}</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  </div>
    </>
  );
};

export default EventDetailsPage;
