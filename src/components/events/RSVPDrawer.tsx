import React, { useState, useEffect } from 'react';
import { X, Users, Baby, FileText, CheckCircle, XCircle } from 'lucide-react';
import { RSVPStatus, RSVPDoc } from '../../types/rsvp';
import { EventDoc } from '../../hooks/useEvents';
import { useAuth } from '../../contexts/AuthContext';
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  event: EventDoc | null;
  onClose: () => void;
  onRSVPUpdate?: () => void;
}

export const RSVPDrawer: React.FC<Props> = ({ open, event, onClose, onRSVPUpdate }) => {
  const { currentUser } = useAuth();
  const [status, setStatus] = useState<RSVPStatus>('going');
  const [adults, setAdults] = useState(1);
  const [kids, setKids] = useState(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && event) {
      // Load existing RSVP if any
      loadExistingRSVP();
    }
  }, [open, event]);

  const loadExistingRSVP = async () => {
    if (!currentUser || !event?.id) return;
    
    try {
      const rsvpRef = doc(db, 'events', event.id, 'rsvps', currentUser.id);
      const snap = await getDoc(rsvpRef);
      
      if (snap.exists()) {
        const data = snap.data();
        setStatus(data.status || 'going');
        setAdults(data.adults || 1);
        setKids(data.kids || 0);
        setNotes(data.notes || '');
      } else {
        // Reset to defaults for new RSVP
        setStatus('going');
        setAdults(1);
        setKids(0);
        setNotes('');
      }
    } catch (error) {
      console.error('Failed to load existing RSVP:', error);
    }
  };

  const handleSubmit = async () => {
    if (!currentUser || !event?.id) return;
    
    setLoading(true);
    try {
      const rsvpRef = doc(db, 'events', event.id, 'rsvps', currentUser.id);
      const snap = await getDoc(rsvpRef);
      
      const rsvpData: Omit<RSVPDoc, 'id'> = {
        eventId: event.id,
        userId: currentUser.id,
        displayName: currentUser.displayName || null,
        email: currentUser.email || null,
        status,
        adults,
        kids,
        notes: notes.trim() || undefined,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (snap.exists()) {
        // Update existing RSVP
        const existing = snap.data();
        const newHistory = [
          ...(existing.statusHistory || []),
          {
            status,
            changedAt: new Date(),
            changedBy: currentUser.id,
          }
        ];
        
        await updateDoc(rsvpRef, {
          ...rsvpData,
          statusHistory: newHistory,
        });
      } else {
        // Create new RSVP
        await setDoc(rsvpRef, {
          ...rsvpData,
          statusHistory: [{
            status,
            changedAt: new Date(),
            changedBy: currentUser.id,
          }],
        });
      }

      toast.success(`RSVP updated: ${status === 'going' ? 'Going' : "Can't Go"}`);
      onRSVPUpdate?.();
      onClose();
    } catch (error) {
      console.error('Failed to submit RSVP:', error);
      toast.error('Failed to submit RSVP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!open || !event || !currentUser) return null;

  const totalAttendees = adults + kids;
  const isCapacityExceeded = event.maxAttendees && totalAttendees > event.maxAttendees;

  return (
    <div className="fixed inset-0 bg-black/50 z-[999] flex justify-end">
      <div className="w-full max-w-md bg-white h-full shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">RSVP for Event</h3>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Event Info */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h4 className="font-medium text-gray-900 mb-2">{event.title}</h4>
          <p className="text-sm text-gray-600">
            {event.startAt && new Date(event.startAt.seconds * 1000).toLocaleDateString()}
          </p>
        </div>

        {/* RSVP Form */}
        <div className="flex-1 p-4 space-y-6 overflow-y-auto">
          {/* Status Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700">RSVP Status</label>
            <div className="grid grid-cols-2 gap-3">
              {(['going', 'not-going'] as const).map((statusOption) => (
                <button
                  key={statusOption}
                  onClick={() => setStatus(statusOption)}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all duration-200 ${
                    status === statusOption
                      ? statusOption === 'going'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {statusOption === 'going' ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <XCircle className="w-5 h-5" />
                  )}
                  <span className="font-medium capitalize">
                    {statusOption === 'not-going' ? "Can't Go" : statusOption}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Attendee Counts - Only show when going */}
          {status === 'going' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Users className="w-4 h-4 text-blue-500" />
                    Adults
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={adults}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setAdults(Math.max(1, Math.min(10, value)));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Baby className="w-4 h-4 text-pink-500" />
                    Kids
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={kids}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setKids(Math.max(0, Math.min(10, value)));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Capacity Warning */}
              {isCapacityExceeded && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">
                    ⚠️ Total attendees ({totalAttendees}) exceeds event capacity ({event.maxAttendees})
                  </p>
                </div>
              )}

              {/* Total Summary */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700">
                  Total attendees: <span className="font-medium">{totalAttendees}</span>
                  {event.maxAttendees && (
                    <span> / {event.maxAttendees} max</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <FileText className="w-4 h-4 text-gray-500" />
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special requirements, dietary restrictions, or additional information..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || (status === 'going' && isCapacityExceeded)}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                loading || (status === 'going' && isCapacityExceeded)
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : status === 'going'
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              {loading ? 'Saving...' : 'Submit RSVP'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
