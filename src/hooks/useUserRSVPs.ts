import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
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
        const rsvpsRef = collection(db, 'rsvps');
        const q = query(
          rsvpsRef,
          where('userId', '==', currentUser.id),
          where('eventId', 'in', eventIds)
        );

        const querySnapshot = await getDocs(q);
        const rsvps: RSVPDoc[] = [];
        
        querySnapshot.forEach((doc) => {
          rsvps.push({ id: doc.id, ...doc.data() } as RSVPDoc);
        });

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

  // Helper function to get RSVP status for a specific event
  const getRSVPStatus = (eventId: string): 'going' | 'not-going' | null => {
    const rsvp = userRSVPs.find(r => r.eventId === eventId);
    return rsvp ? rsvp.status : null;
  };

  return {
    userRSVPs,
    loading,
    error,
    getRSVPStatus
  };
};
