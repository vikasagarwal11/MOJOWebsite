import React, { useEffect, useMemo, useState } from 'react';
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

  // Prefer startAt
  const dateObj: Date = useMemo(() => {
    const v: any = event.startAt;
    if (v?.toDate) return v.toDate();
    if (typeof v === 'string') return new Date(v);
    return new Date(v);
  }, [event.startAt]);

  const isUpcoming = dateObj.getTime() >= Date.now();

  // My RSVP (load my doc once)
  const [rsvpStatus, setRsvpStatus] = useState<'going' | 'maybe' | 'not-going' | null>(null);
  useEffect(() => {
    let cancel = false;
    async function fetchMyRsvp() {
      if (!currentUser || !event?.id) return;
      const rsvpRef = doc(db, 'events', String(event.id), 'rsvps', currentUser.id);
      const snap = await getDoc(rsvpRef);
      if (!cancel) setRsvpStatus((snap.data()?.status as any) ?? null);
    }
    fetchMyRsvp();
    return () => { cancel = true; };
  }, [currentUser?.id, event?.id]);

  const attendingCount: number = event.attendingCount ?? 0;

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
        await updateDoc(rsvpRef, { status, updatedAt: serverTimestamp() });
      } else {
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
          <img
            src={event.imageUrl}
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}

      <div className="p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-purple-600 transition-colors">
          {event.title}
        </h3>

        <div className="space-y-2 mb-4">
          <div className="flex items-center text-gray-600">
            <Calendar className="w-4 h-4 mr-2 text-purple-500" />
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm bg-purple-50 text-purple-700 border border-purple-200">
              <CalendarDays className="w-4 h-4" />
              {format(dateObj, 'EEE, MMM d • h:mm a')}
            </span>
          </div>
          <div className="flex items-center text-gray-600">
            <Clock className="w-4 h-4 mr-2 text-purple-500" />
            <span className="text-sm">{format(dateObj, 'h:mm a')}</span>
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
