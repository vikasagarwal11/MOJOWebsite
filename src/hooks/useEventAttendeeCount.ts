import { useState, useEffect } from 'react';
import { collection, query, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { RSVPDoc } from '../types/rsvp';

export interface EventAttendeeCount {
  eventId: string;
  totalAttendees: number;
  goingCount: number;
  notGoingCount: number;
  isFull: boolean;
  remainingSpots: number;
}

export const useEventAttendeeCount = (eventIds: string[]) => {
  const [attendeeCounts, setAttendeeCounts] = useState<EventAttendeeCount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  useEffect(() => {
    const fetchAttendeeCounts = async () => {
      if (eventIds.length === 0) {
        setAttendeeCounts([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const counts: EventAttendeeCount[] = [];

        for (const eventId of eventIds) {
          if (eventId) {
            // Get all RSVPs for this event
            const rsvpsRef = collection(db, 'events', eventId, 'rsvps');
            const rsvpsSnap = await getDocs(rsvpsRef);
            
            let totalAttendees = 0;
            let goingCount = 0;
            let notGoingCount = 0;

            rsvpsSnap.forEach((doc) => {
              const rsvpData = doc.data() as RSVPDoc;
              
              if (rsvpData.status === 'going') {
                // Calculate total attendees for this RSVP
                const rsvpAttendees = 1 + // Primary user
                  (rsvpData.adults || 0) + // Additional adults
                  (rsvpData.childCounts?.reduce((sum, child) => sum + (child.count || 0), 0) || 0); // Children
                
                totalAttendees += rsvpAttendees;
                goingCount++;
              } else if (rsvpData.status === 'not-going') {
                notGoingCount++;
              }
            });

            counts.push({
              eventId,
              totalAttendees,
              goingCount,
              notGoingCount,
              isFull: false, // Will be calculated when we have maxAttendees
              remainingSpots: 0 // Will be calculated when we have maxAttendees
            });
          }
        }

        setAttendeeCounts(counts);
      } catch (err) {
        console.error('Error fetching attendee counts:', err);
        setError('Failed to fetch attendee data');
      } finally {
        setLoading(false);
      }
    };

    fetchAttendeeCounts();
  }, [eventIds, refreshTrigger]);

  // Helper function to get attendee count for a specific event
  const getAttendeeCount = (eventId: string): EventAttendeeCount | null => {
    return attendeeCounts.find(count => count.eventId === eventId) || null;
  };

  // Helper function to get total attendees for a specific event
  const getTotalAttendees = (eventId: string): number => {
    const count = getAttendeeCount(eventId);
    return count ? count.totalAttendees : 0;
  };

  return {
    attendeeCounts,
    loading,
    error,
    getAttendeeCount,
    getTotalAttendees,
    refresh
  };
};
