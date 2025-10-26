import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, MapPin, Clock, Users, Tag, ArrowLeft } from 'lucide-react';
import { safeFormat, safeToDate } from '../utils/dateUtils';
import { EventDoc } from '../hooks/useEvents';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { EventImage } from '../components/events/EventImage';

const EventDetailsPage: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Event Not Found</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <Link
              to="/events-readonly"
              className="inline-flex items-center px-6 py-3 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] transition-colors duration-200"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Events
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const eventStatus = getEventStatus(event);
  const duration = getEventDuration();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6"
        >
          <Link
            to="/events-readonly"
            className="inline-flex items-center text-gray-600 hover:text-[#F25129] transition-colors duration-200"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Events
          </Link>
        </motion.div>

        {/* Event Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-8"
        >
          {/* Event Image with Smart Cropping Prevention */}
          <EventImage 
            src={event.imageUrl} 
            alt={event.title} 
            fit="contain" 
            aspect="16/9"
            title={event.title}
          >
            {/* Status Badge Only */}
            <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${eventStatus.bgColor} ${eventStatus.color}`}>
              {eventStatus.status}
            </span>
          </EventImage>

          {/* Event Content */}
          <div className="p-8">
            {/* Title */}
            <h1 className="text-3xl font-bold text-gray-900 mb-4">{event.title}</h1>

            {/* Description */}
            {event.description && (
              <p className="text-lg text-gray-700 leading-relaxed mb-8">{event.description}</p>
            )}

            {/* Event Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* Date */}
              <div className="flex items-center">
                <Calendar className="w-5 h-5 mr-4 text-[#F25129] flex-shrink-0" />
                <div>
                  <div className="font-medium text-gray-900">{formatEventDate(event.startAt)}</div>
                </div>
              </div>

              {/* Time */}
              <div className="flex items-center">
                <Clock className="w-5 h-5 mr-4 text-[#F25129] flex-shrink-0" />
                <div>
                  <div className="font-medium text-gray-900">
                    {formatEventTime(event.startAt)}
                    {event.endAt && ` - ${formatEventTime(event.endAt)}`}
                    {duration && ` (${duration} hours)`}
                  </div>
                </div>
              </div>

              {/* Location - Clickable for Directions */}
              {(event.venueName || event.venueAddress || event.location) && (
                <div className="flex items-start">
                  <MapPin className="w-5 h-5 mr-4 text-[#F25129] mt-1 flex-shrink-0" />
                  <div>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location || getDisplayVenueInfo(event.venueName || '', event.venueAddress || ''))}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                    >
                      {event.location || getDisplayVenueInfo(event.venueName || '', event.venueAddress || '')}
                    </a>
                  </div>
                </div>
              )}

              {/* Attendee Count */}
              {event.maxAttendees && (
                <div className="space-y-3">
                  <div className="flex items-center">
                    <Users className="w-5 h-5 mr-4 text-[#F25129] flex-shrink-0" />
                    <div className="font-medium text-gray-900">
                      {event.attendingCount || 0}/{event.maxAttendees} spots
                    </div>
                  </div>
                  {/* Only show waitlist if waitlist is enabled */}
                  {event.waitlistEnabled && (
                    <div className="flex items-center">
                      <Users className="w-5 h-5 mr-4 text-yellow-600 flex-shrink-0" />
                      <div className="text-sm text-gray-600">
                        {event.waitlistCount || 0} on waitlist
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Price Information */}
              {event.pricing && (
                <div className="flex items-center">
                  <div className="w-5 h-5 mr-4 flex-shrink-0 flex items-center justify-center">
                    <span className="text-lg font-bold text-green-600">$</span>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-green-600">
                      {event.pricing.adultPrice ? `$${event.pricing.adultPrice}` : 'Free'}
                    </div>
                    {event.pricing.childPrice && (
                      <div className="text-sm text-gray-600">
                        Child: ${event.pricing.childPrice}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Tags */}
            {event.tags && event.tags.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center mb-4">
                  <Tag className="w-5 h-5 mr-2 text-[#F25129]" />
                  <h3 className="text-lg font-semibold text-gray-900">Tags</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {event.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

          </div>
        </motion.div>

        {/* RSVP Notice */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center"
        >
          <h3 className="text-lg font-semibold text-blue-900 mb-2">RSVP Functionality</h3>
          <p className="text-blue-800">
            RSVP and ticketing features are temporarily disabled while we finalize production deployment. 
            Full functionality will be restored soon.
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default EventDetailsPage;
