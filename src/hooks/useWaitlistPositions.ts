import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';

type PositionsMap = Map<string, number>;

export function useWaitlistPositions(eventId: string, currentUserId?: string) {
  const [positions, setPositions] = useState<PositionsMap>(new Map());
  const [myPosition, setMyPosition] = useState<number | null>(null);

  useEffect(() => {
    if (!eventId) return;
    
    const q = query(
      collection(db, 'events', eventId, 'attendees'),
      where('rsvpStatus', '==', 'waitlisted'),
      orderBy('createdAt', 'asc') // first-in-first-out
    );

    const unsub = onSnapshot(q, (snap) => {
      const map: PositionsMap = new Map();
      snap.docs.forEach((doc, idx) => {
        const data = doc.data() as { userId?: string };
        if (data?.userId) map.set(data.userId, idx + 1); // 1-based
      });
      setPositions(map);
      setMyPosition(currentUserId ? (map.get(currentUserId) ?? null) : null);
    });

    return () => unsub();
  }, [eventId, currentUserId]);

  // handy derived values
  const waitlistCount = useMemo(() => positions.size, [positions]);

  return { positions, myPosition, waitlistCount };
}
