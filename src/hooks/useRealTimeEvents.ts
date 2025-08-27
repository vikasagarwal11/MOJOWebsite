import { useEffect, useRef, useState, useCallback } from 'react';
import { onSnapshot, collection, query, where, orderBy, Timestamp, FirestoreError } from 'firebase/firestore';
import { db } from '../config/firebase';
import { EventDoc } from './useEvents';
import toast from 'react-hot-toast';

interface UseRealTimeEventsOptions {
  enableNotifications?: boolean;
  enableRealTimeUpdates?: boolean;
  userId?: string;
}

interface UseRealTimeEventsResult {
  events: EventDoc[];
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refreshEvents: () => void;
}

export function useRealTimeEvents(options: UseRealTimeEventsOptions = {}): UseRealTimeEventsResult {
  const { enableNotifications = true, enableRealTimeUpdates = true, userId } = options;
  
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const previousEventsRef = useRef<Map<string, EventDoc>>(new Map());
  const notificationShownRef = useRef<Set<string>>(new Set());

  // Build queries based on user authentication
  const buildQueries = useCallback(() => {
    const nowTs = Timestamp.fromMillis(Date.now());
    const eventsRef = collection(db, 'events');
    
    if (!userId) {
      // Public events only for guests
      return [
        query(
          eventsRef,
          where('visibility', '==', 'public'),
          where('startAt', '>=', nowTs),
          orderBy('startAt', 'asc')
        )
      ];
    }

    // Multiple queries for authenticated users
    return [
      query(
        eventsRef,
        where('visibility', 'in', ['public', 'members']),
        where('startAt', '>=', nowTs),
        orderBy('startAt', 'asc')
      ),
      query(
        eventsRef,
        where('createdBy', '==', userId),
        where('startAt', '>=', nowTs),
        orderBy('startAt', 'asc')
      ),
      query(
        eventsRef,
        where('invitedUserIds', 'array-contains', userId),
        where('startAt', '>=', nowTs),
        orderBy('startAt', 'asc')
      )
    ];
  }, [userId]);

  // Handle real-time updates
  const handleSnapshot = useCallback((snapshot: any, queryIndex: number) => {
    const newEvents = new Map<string, EventDoc>();
    
    snapshot.docs.forEach((doc: any) => {
      const eventData = { id: doc.id, ...doc.data() } as EventDoc;
      newEvents.set(doc.id, eventData);
    });

    // Merge events from all queries
    setEvents(prevEvents => {
      const mergedEvents = new Map(prevEvents.map(e => [e.id, e]));
      
      // Update with new data
      newEvents.forEach((event, id) => {
        mergedEvents.set(id, event);
      });

      // Check for new events and show notifications
      if (enableNotifications && userId) {
        newEvents.forEach((event, id) => {
          const previousEvent = previousEventsRef.current.get(id);
          
          // Show notification for new events
          if (!previousEvent && !notificationShownRef.current.has(id)) {
            notificationShownRef.current.add(id);
            
            // Check if event is starting soon (within 24 hours)
            const eventStart = new Date(event.startAt.seconds * 1000);
            const now = new Date();
            const hoursUntilEvent = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60);
            
            if (hoursUntilEvent <= 24 && hoursUntilEvent > 0) {
              toast.success(
                `🎉 New event: ${event.title} starts in ${Math.floor(hoursUntilEvent)} hours!`,
                {
                  duration: 5000,
                  icon: '📅',
                  style: {
                    background: '#10B981',
                    color: 'white',
                  },
                }
              );
            } else if (!previousEvent) {
              toast.success(
                `📅 New event: ${event.title}`,
                {
                  duration: 4000,
                  icon: '🎉',
                }
              );
            }
          }
        });
      }

      // Update previous events reference
      previousEventsRef.current = new Map(mergedEvents);
      
      return Array.from(mergedEvents.values()).sort((a, b) => {
        const aTime = a.startAt.seconds;
        const bTime = b.startAt.seconds;
        return aTime - bTime;
      });
    });

    setLastUpdate(new Date());
    setLoading(false);
    setError(null);
  }, [enableNotifications, userId]);

  // Handle errors
  const handleError = useCallback((error: FirestoreError) => {
    console.error('[real-time-events] Error:', error);
    setError(error.message || 'Failed to load events in real-time');
    setLoading(false);
  }, []);

  // Set up real-time listeners
  useEffect(() => {
    if (!enableRealTimeUpdates) return;

    const queries = buildQueries();
    const unsubs: Array<() => void> = [];

    queries.forEach((query, index) => {
      const unsubscribe = onSnapshot(
        query,
        (snapshot) => handleSnapshot(snapshot, index),
        handleError
      );
      unsubs.push(unsubscribe);
    });

    // Store unsubscribe function
    unsubscribeRef.current = () => {
      unsubs.forEach(unsub => unsub());
    };

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [enableRealTimeUpdates, buildQueries, handleSnapshot, handleError]);

  // Manual refresh function
  const refreshEvents = useCallback(() => {
    setLoading(true);
    setError(null);
    
    // Force a refresh by temporarily disabling and re-enabling real-time updates
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    
    // Re-enable real-time updates after a short delay
    setTimeout(() => {
      const queries = buildQueries();
      const unsubs: Array<() => void> = [];
      
      queries.forEach((query, index) => {
        const unsubscribe = onSnapshot(
          query,
          (snapshot) => handleSnapshot(snapshot, index),
          handleError
        );
        unsubs.push(unsubscribe);
      });
      
      unsubscribeRef.current = () => {
        unsubs.forEach(unsub => unsub());
      };
    }, 100);
  }, [buildQueries, handleSnapshot, handleError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  return {
    events,
    loading,
    error,
    lastUpdate,
    refreshEvents
  };
}
