import { useEffect, useRef, useState, useCallback } from 'react';
import { onSnapshot, collection, query, where, orderBy, Timestamp, FirestoreError } from 'firebase/firestore';
import { db } from '../config/firebase';
import { EventDoc } from './useEvents';
import { normalizeEvent } from '../utils/normalizeEvent';
import { sanitizeFirebaseData } from '../utils/dataSanitizer';
import toast from 'react-hot-toast';

interface UseRealTimeEventsOptions {
  enableNotifications?: boolean;
  enableRealTimeUpdates?: boolean;
  userId?: string;
  isApproved?: boolean; // Whether user is approved (non-approved users see only public events)
}

interface UseRealTimeEventsResult {
  events: EventDoc[];
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refreshEvents: () => void;
  upcomingCount: number;
}

export function useRealTimeEvents(options: UseRealTimeEventsOptions = {}): UseRealTimeEventsResult {
  const { enableNotifications = true, enableRealTimeUpdates = true, userId, isApproved = false } = options;
  
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [upcomingCount, setUpcomingCount] = useState(0);
  
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const previousEventsRef = useRef<Map<string, EventDoc>>(new Map());
  const notificationQueueRef = useRef<{ title: string; message: string }[]>([]);

  // Process queued notifications after render
  useEffect(() => {
    if (notificationQueueRef.current.length > 0) {
      notificationQueueRef.current.forEach(({ message }) => {
        toast.success(message, {
          duration: 5000,
          icon: '📅',
          style: { background: '#10B981', color: 'white' },
        });
        if (navigator.vibrate) navigator.vibrate(200); // Vibration for notification
      });
      notificationQueueRef.current = [];
    }
  }, [events]); // Trigger on events update

  // Build queries based on user authentication and approval status
  // Non-approved users (pending/rejected) are treated like logged-out users and only see public events
  const buildQueries = useCallback(() => {
    const nowTs = Timestamp.fromMillis(Date.now());
    const eventsRef = collection(db, 'events');
    
    // Members-only events are now visible to everyone, but only members can RSVP
    if (!userId || !isApproved) {
      // Show both public and members-only events to everyone (non-members can see but not RSVP)
      return [
        query(
          eventsRef,
          where('visibility', 'in', ['public', 'members']),
          where('startAt', '>=', nowTs),
          orderBy('startAt', 'asc')
        )
      ];
    }

    // Multiple queries for approved authenticated users
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
  }, [userId, isApproved]);

  // Handle real-time updates
  const handleSnapshot = useCallback((snapshot: any) => {
    const newEvents = new Map<string, EventDoc>();
    
    snapshot.docs.forEach((doc: any) => {
      const rawData = doc.data();
      const sanitizedData = sanitizeFirebaseData(rawData);
      const eventData = normalizeEvent({ id: doc.id, ...sanitizedData });
      newEvents.set(doc.id, eventData);
    });

    // Debug logging for event updates
    newEvents.forEach((event, id) => {
      const previousEvent = previousEventsRef.current.get(id);
      if (previousEvent && previousEvent.attendingCount !== event.attendingCount) {
        console.log('🔍 Event attendingCount changed:', {
          eventId: id,
          eventTitle: event.title,
          oldCount: previousEvent.attendingCount,
          newCount: event.attendingCount,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Merge events from all queries
    setEvents(prevEvents => {
      const mergedEvents = new Map(prevEvents.map(e => [e.id, e]));
      
      // Update with new data
      newEvents.forEach((event, id) => {
        mergedEvents.set(id, event);
      });

      // Check for new events and queue notifications
      if (enableNotifications && userId) {
        newEvents.forEach((event, id) => {
          const previousEvent = previousEventsRef.current.get(id);
          
          // Queue notification for new events
          if (!previousEvent) {
            // Use normalized startAt (already converted to Date by normalizeEvent)
            const eventStart = event.startAt instanceof Date ? event.startAt : new Date();
            const hoursUntil = (eventStart.getTime() - Date.now()) / (3600 * 1000);
            
            if (hoursUntil <= 24 && hoursUntil > 0) {
              notificationQueueRef.current.push({
                title: event.title,
                message: `🎉 New event: ${event.title} starts in ${Math.floor(hoursUntil)} hours!`
              });
            } else {
              notificationQueueRef.current.push({
                title: event.title,
                message: `📅 New event: ${event.title}`
              });
            }
          }
        });
      }

      // Update previous events reference
      previousEventsRef.current = new Map(mergedEvents);
      
      const sorted = Array.from(mergedEvents.values()).sort((a, b) => {
        // Use normalized startAt (already converted to Date by normalizeEvent)
        const aTime = a.startAt instanceof Date ? a.startAt.getTime() : new Date().getTime();
        const bTime = b.startAt instanceof Date ? b.startAt.getTime() : new Date().getTime();
        return aTime - bTime;
      });
      
      setUpcomingCount(sorted.length);
      return sorted;
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

    queries.forEach((query) => {
      const unsubscribe = onSnapshot(
        query,
        (snapshot) => handleSnapshot(snapshot),
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
      
      queries.forEach((query) => {
        const unsubscribe = onSnapshot(
          query,
          (snapshot) => handleSnapshot(snapshot),
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
    refreshEvents,
    upcomingCount
  };
}
