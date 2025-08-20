// src/components/events/EventCard.tsx
import React, { useMemo, useState } from 'react';
import { Calendar, CalendarDays, MapPin, Users, Clock, CheckCircle, XCircle, HelpCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../config/firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface EventCardProps {
  event: any;
}

const EventCard: React.FC<EventCardProps> = ({ event }) => {
  const { currentUser } = useAuth();

  // prefer startAt, fallback to date
 // const dateObj = useMemo(() => {
  //  const v: any = event.startAt ?? event.date;
    // @ts-ignore
  //  if (v?.toDate) return v.toDate();
   // if (typeof v === 'string') return new Date(v);
   //return (v as Date) || new Date();
 // }, [event.startAt, event.date]);
const dateObj =
  event.startAt?.toDate ? event.startAt.toDate() :
  typeof event.startAt === 'string' ? new Date(event.startAt) :
  new Date(event.startAt);
  
  // for “upcoming” logic include time if provided
  const eventMoment = useMemo(() => {
    const d = new Date(dateObj);
    const [h, m] = String(event.time || '00:00').split(':').map(Number);
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
  }, [dateObj, event.time]);

  const isUpcoming = eventMoment.getTime() >= Date.now();

  const rsvps = Array.isArray(event.rsvps) ? event.rsvps : [];
  const [rsvpStatus, setRsvpStatus] = useState<'going' | 'maybe' | 'not-going' | null>(
    currentUser ? (rsvps.find((r: any) => r.userId === currentUser.id)?.status ?? null) : null
  );

  const attendingCount =
    Array.isArray(event.rsvps)
      ? event.rsvps.filter((r: any) => r.status === 'going').length
      : (event.attendees?.length ?? 0);

  const getRSVPIcon = (status: string) =>
    status === 'going' ? <CheckCircle className="w-4 h-4" /> :
    status === 'maybe' ? <HelpCircle className="w-4 h-4" /> :
    status === 'not-going' ? <XCircle className="w-4 h-4" /> : null;

  const getRSVPColor = (status: string) =>
    status === 'going' ? 'bg-green-100 text-green-700 border-green-200' :
    status === 'maybe' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
    status === 'not-going' ? 'bg-red-100 text-red-700 border-red-200' :
    'bg-gray-100 text-gray-700 border-gray-200';

  const handleRSVP = async (status: 'going' | 'maybe' | 'not-going') => {
    if (!currentUser || !event?.id) return;
    setRsvpStatus(status);
    try {
      const rsvpRef = doc(db, 'events', String(event.id), 'rsvps', currentUser.id);
      const snap = await getDoc(rsvpRef);
      if (snap.exists()) {
        // Rules: update only ['status','updatedAt']
        await updateDoc(rsvpRef, { status, updatedAt: serverTimestamp() });
      } else {
        // Rules: create only ['status','createdAt']
        await setDoc(rsvpRef, { status, createdAt: serverTimestamp() });
      }
    } catch (e) {
      console.error('RSVP write failed', e);
    }
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border border-purple-100 group">
      {event.imageUrl && (
        <div className="h-48 overflow-hidden">
          <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>
      )}

      <div className="p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-purple-600 transition-colors">
          {event.title}
        </h3>

        <div className="space-y-2 mb-4">
          <div className="flex items-center text-gray-600">
            <Calendar className="w-4 h-4 mr-2 text-purple-500" />
            <span className="text-sm">{format(dateObj, 'EEEE, MMMM d, yyyy')}</span>
          </div>
          <div className="flex items-center text-gray-600">
            <Clock className="w-4 h-4 mr-2 text-purple-500" />
            <span className="text-sm">{event.time}</span>
          </div>
          <div className="flex items-center text-gray-600">
            <MapPin className="w-4 h-4 mr-2 text-purple-500" />
            <span className="text-sm">{event.location}</span>
          </div>
          <div className="flex items-center text-gray-600">
            <Users className="w-4 h-4 mr-2 text-purple-500" />
            <span className="text-sm">
              {attendingCount} attending{event.maxAttendees ? ` • ${event.maxAttendees} max` : ''}
            </span>
          </div>
        </div>

        <p className="text-gray-600 text-sm mb-6 line-clamp-3">{event.description}</p>

        {currentUser && isUpcoming && (
          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-700 mb-2">Your RSVP:</div>
            <div className="flex space-x-2">
              {(['going', 'maybe', 'not-going'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => handleRSVP(status)}
                  className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium border transition-all duration-200 ${
                    rsvpStatus === status ? getRSVPColor(status) : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {getRSVPIcon(status)}
                  <span className="ml-1 capitalize">{status === 'not-going' ? "Can't Go" : status}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!isUpcoming && (
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">Past Event</span>
            <span className="text-sm text-gray-500">{attendingCount} attended</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default EventCard;
