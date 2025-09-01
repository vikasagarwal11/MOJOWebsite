import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { RSVPDoc } from '../types/rsvp';
import { useAuth } from '../contexts/AuthContext';

export const useUserRSVPs = (eventIds: string[]) => {
  const [userRSVPs, setUserRSVPs] = useState<RSVPDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currentUser } = useAuth();

  useEffect(() => {
    const fetchUserRSVPs = async () => {
      if (!currentUser || eventIds.length === 0) {
        setUserRSVPs([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Query RSVPs from the correct subcollection path: events/{eventId}/rsvps/{userId}
        const rsvps: RSVPDoc[] = [];
        
        for (const eventId of eventIds) {
          if (eventId) {
            const rsvpRef = doc(db, 'events', eventId, 'rsvps', currentUser.id);
            const rsvpSnap = await getDoc(rsvpRef);
            
            if (rsvpSnap.exists()) {
              rsvps.push({ id: rsvpSnap.id, ...rsvpSnap.data() } as RSVPDoc);
            }
          }
        }

        setUserRSVPs(rsvps);
      } catch (err) {
        console.error('Error fetching user RSVPs:', err);
        setError('Failed to fetch RSVP data');
      } finally {
        setLoading(false);
      }
    };

    fetchUserRSVPs();
  }, [currentUser, eventIds]);

  // Helper function to get RSVP status for a specific event - memoized with useCallback
  const getRSVPStatus = useCallback((eventId: string): 'going' | 'not-going' | null => {
    const rsvp = userRSVPs.find(r => r.eventId === eventId);
    return rsvp ? rsvp.status : null;
  }, [userRSVPs]);

  return {
    userRSVPs,
    loading,
    error,
    getRSVPStatus
  };
};
