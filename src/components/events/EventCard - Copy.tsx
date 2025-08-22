import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, CalendarDays, MapPin, Users, Clock, CheckCircle, XCircle, HelpCircle, Edit, Trash2, CalendarPlus } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { db, storage } from '../../config/firebase';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import toast from 'react-hot-toast';
import { createEvent } from 'ics';

interface EventCardProps {
  event: any;
  onEdit?: () => void;
}

// Helper function to convert timestamp to Date
function tsToDate(v: any): Date {
  if (!v) return new Date();
  if (typeof v?.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'string') return new Date(v);
  return new Date(v);
}

const EventCard: React.FC<EventCardProps> = ({ event, onEdit }) => {
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
        // Get current RSVP data to build statusHistory
        const currentData = snap.data();
        const statusHistory = currentData.statusHistory || [];
        
        // Add new status change entry
        const newHistoryEntry = {
          status: status,
          changedBy: currentUser.id,
          changedAt: serverTimestamp()
        };
        
        await updateDoc(rsvpRef, { 
          status, 
          updatedAt: serverTimestamp(),
          statusHistory: [...statusHistory, newHistoryEntry]
        });
      } else {
        // Create new RSVP with initial statusHistory
        const initialHistoryEntry = {
          status: status,
          changedBy: currentUser.id,
          changedAt: serverTimestamp()
        };
        
        await setDoc(rsvpRef, { 
          status, 
          createdAt: serverTimestamp(),
          statusHistory: [initialHistoryEntry]
        });
      }
    } catch (e) {
      console.error('RSVP write failed', e);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'events', event.id));
      await deleteDoc(doc(db, 'event_teasers', event.id)).catch(() => {});
      const rsvps = await getDocs(collection(db, 'events', event.id, 'rsvps'));
      for (const rsvp of rsvps.docs) {
        await deleteDoc(rsvp.ref);
      }
      if (event.imageUrl) {
        const imageRef = ref(storage, `events/${event.id}/${event.imageUrl.split('/').pop()}`);
        await deleteObject(imageRef).catch(() => {});
      }
      toast.success('Event deleted');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete event');
    }
  };

  const handleAddToCalendar = () => {
    const start = dateObj;
    const end = event.endAt ? tsToDate(event.endAt) : new Date(start.getTime() + 60 * 60 * 1000);
    
    createEvent({
      start: [start.getFullYear(), start.getMonth() + 1, start.getDate(), start.getHours(), start.getMinutes()],
      end: [end.getFullYear(), end.getMonth() + 1, end.getDate(), end.getHours(), end.getMinutes()],
      title: event.title,
      description: event.description,
      location: event.location,
    }, (err, value) => {
      if (err) {
        toast.error('Failed to generate calendar event');
        return;
      }
      const blob = new Blob([value], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${event.title}.ics`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Event added to calendar');
    });
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

        {/* Action Buttons */}
        <div className="flex justify-between items-center mb-4">
          {/* Add to Calendar Button */}
          <button
            onClick={handleAddToCalendar}
            className="flex items-center px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
          >
            <CalendarPlus className="w-4 h-4 mr-1" />
            Add to Calendar
          </button>
        </div>
        
        {/* Admin/Event Creator Actions */}
        {(currentUser?.role === 'admin' || currentUser?.id === event.createdBy) && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={onEdit}
              className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        )}

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
