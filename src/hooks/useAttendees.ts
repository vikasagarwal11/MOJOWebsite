import { useState, useEffect, useCallback } from 'react';
import { 
  Attendee, 
  CreateAttendeeData, 
  UpdateAttendeeData, 
  AttendeeStatus,
  AttendeeCounts 
} from '../types/attendee';
import {
  listAttendees,
  upsertAttendee,
  updateAttendee,
  deleteAttendee,
  bulkUpsertAttendees,
  setAttendeeStatus,
  calculateAttendeeCounts,
  subscribeToAttendees,
  getUserAttendees
} from '../services/attendeeService';

interface UseAttendeesReturn {
  attendees: Attendee[];
  counts: AttendeeCounts;
  loading: boolean;
  error: string | null;
  addAttendee: (attendeeData: CreateAttendeeData) => Promise<string>;
  updateAttendee: (attendeeId: string, updateData: UpdateAttendeeData) => Promise<void>;
  removeAttendee: (attendeeId: string) => Promise<void>;
  setAttendeeStatus: (attendeeId: string, status: AttendeeStatus) => Promise<void>;
  bulkAddAttendees: (attendees: CreateAttendeeData[]) => Promise<string[]>;
  getUserAttendees: (userId: string) => Attendee[];
  refreshAttendees: () => Promise<void>;
}

export const useAttendees = (eventId: string): UseAttendeesReturn => {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [counts, setCounts] = useState<AttendeeCounts>({
    goingCount: 0,
    notGoingCount: 0,
    pendingCount: 0,
    totalGoingByAgeGroup: {
      '0-2': 0,
      '3-5': 0,
      '6-10': 0,
      '11+': 0
    },
    totalGoing: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load attendees on mount
  useEffect(() => {
    if (!eventId) return;

    const loadAttendees = async () => {
      try {
        setLoading(true);
        setError(null);
        const eventAttendees = await listAttendees(eventId);
        setAttendees(eventAttendees);
        
        const eventCounts = calculateAttendeeCounts(eventAttendees);
        setCounts(eventCounts);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load attendees');
        console.error('Error loading attendees:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAttendees();
  }, [eventId]);

  // Set up real-time listener
  useEffect(() => {
    if (!eventId) return;

    const unsubscribe = subscribeToAttendees(eventId, (eventAttendees) => {
      setAttendees(eventAttendees);
      const eventCounts = calculateAttendeeCounts(eventAttendees);
      setCounts(eventCounts);
    });

    return () => unsubscribe();
  }, [eventId]);

  // Add single attendee
  const addAttendee = useCallback(async (attendeeData: CreateAttendeeData): Promise<string> => {
    try {
      setError(null);
      const attendeeId = await upsertAttendee(attendeeData);
      
      // Optimistic update
      const newAttendee: Attendee = {
        attendeeId,
        ...attendeeData,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      setAttendees(prev => [...prev, newAttendee]);
      return attendeeId;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add attendee';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  // Update attendee
  const updateAttendeeData = useCallback(async (attendeeId: string, updateData: UpdateAttendeeData): Promise<void> => {
    try {
      setError(null);
      await updateAttendee(eventId, attendeeId, updateData);
      
      // Optimistic update
      setAttendees(prev => prev.map(attendee => 
        attendee.attendeeId === attendeeId 
          ? { ...attendee, ...updateData, updatedAt: new Date() }
          : attendee
      ));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update attendee';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [eventId]);

  // Remove attendee
  const removeAttendee = useCallback(async (attendeeId: string): Promise<void> => {
    try {
      setError(null);
      await deleteAttendee(eventId, attendeeId);
      
      // Optimistic update
      setAttendees(prev => prev.filter(attendee => attendee.attendeeId !== attendeeId));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove attendee';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [eventId]);

  // Set attendee status
  const setAttendeeStatusData = useCallback(async (attendeeId: string, status: AttendeeStatus): Promise<void> => {
    try {
      setError(null);
      await setAttendeeStatus(eventId, attendeeId, status);
      
      // Optimistic update
      setAttendees(prev => prev.map(attendee => 
        attendee.attendeeId === attendeeId 
          ? { ...attendee, rsvpStatus: status, updatedAt: new Date() }
          : attendee
      ));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update attendee status';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [eventId]);

  // Bulk add attendees
  const bulkAddAttendees = useCallback(async (attendeesData: CreateAttendeeData[]): Promise<string[]> => {
    try {
      setError(null);
      const attendeeIds = await bulkUpsertAttendees(eventId, attendeesData);
      
      // Optimistic update
      const newAttendees: Attendee[] = attendeesData.map((data, index) => ({
        attendeeId: attendeeIds[index],
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      }));
      
      setAttendees(prev => [...prev, ...newAttendees]);
      return attendeeIds;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to bulk add attendees';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [eventId]);

  // Get attendees by user
  const getUserAttendeesData = useCallback((userId: string): Attendee[] => {
    return attendees.filter(attendee => attendee.userId === userId);
  }, [attendees]);

  // Refresh attendees
  const refreshAttendees = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const eventAttendees = await listAttendees(eventId);
      setAttendees(eventAttendees);
      
      const eventCounts = calculateAttendeeCounts(eventAttendees);
      setCounts(eventCounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh attendees');
      console.error('Error refreshing attendees:', err);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  return {
    attendees,
    counts,
    loading,
    error,
    addAttendee,
    updateAttendee: updateAttendeeData,
    removeAttendee,
    setAttendeeStatus: setAttendeeStatusData,
    bulkAddAttendees,
    getUserAttendees: getUserAttendeesData,
    refreshAttendees
  };
};
