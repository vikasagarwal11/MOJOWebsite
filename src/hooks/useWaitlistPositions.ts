import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { sanitizeFirebaseData } from '../utils/dataSanitizer';

type PositionsMap = Map<string, number>;

export function useWaitlistPositions(eventId: string, currentUserId?: string) {
  const [positions, setPositions] = useState<PositionsMap>(new Map());
  const [myPosition, setMyPosition] = useState<number | null>(null);
  const [waitlistData, setWaitlistData] = useState<any[]>([]);

  useEffect(() => {
    if (!eventId) return;
    
    // Query waitlisted attendees ordered by their stored position
    // Temporarily remove orderBy until Firestore index is built
    const q = query(
      collection(db, 'events', eventId, 'attendees'),
      where('rsvpStatus', '==', 'waitlisted')
      // TODO: Add back orderBy('waitlistPosition', 'asc') once index is built
    );

    const unsub = onSnapshot(q, (snap) => {
      const map: PositionsMap = new Map();
      const attendees: any[] = [];
      
      console.log('🔍 useWaitlistPositions: Fetched', snap.docs.length, 'waitlisted attendees');
      
      snap.docs.forEach((doc) => {
        const rawData = doc.data();
        const data = sanitizeFirebaseData(rawData);
        console.log('🔍 Attendee data for user', data.userId, ':', {
          userId: data.userId,
          waitlistPosition: data.waitlistPosition,
          rsvpStatus: data.rsvpStatus,
          hasPosition: !!data.waitlistPosition
        });
        
        if (data?.userId && typeof data.userId === 'string' && data?.waitlistPosition && typeof data.waitlistPosition === 'number') {
          // Use stored position from database, not array index
          map.set(data.userId, data.waitlistPosition);
          attendees.push({ id: doc.id, ...data });
        }
      });
      
      // Sort attendees by waitlist position since we can't use orderBy yet
      attendees.sort((a, b) => (a.waitlistPosition || 0) - (b.waitlistPosition || 0));
      
      console.log('🔍 Final waitlist positions map:', map);
      console.log('🔍 My position for current user', currentUserId, ':', currentUserId ? (map.get(currentUserId) ?? null) : null);
      
      setPositions(map);
      setWaitlistData(attendees);
      setMyPosition(currentUserId ? (map.get(currentUserId) ?? null) : null);
    });

    return () => unsub();
  }, [eventId, currentUserId]);

  // handy derived values
  const waitlistCount = useMemo(() => positions.size, [positions]);

  return { positions, myPosition, waitlistCount, waitlistData };
}
