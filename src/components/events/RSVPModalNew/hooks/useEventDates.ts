import { useMemo } from 'react';
import { format } from 'date-fns';
import { EventDoc } from '../../../../hooks/useEvents';

/**
 * Hook to handle all event date-related logic and formatting
 * Encapsulates the complex date handling from Firestore Timestamps
 */
export const useEventDates = (event: EventDoc) => {
  return useMemo(() => {
    // Helper to safely convert Firestore Timestamp to Date
    const toJsDate = (d: any) => (d?.toDate ? d.toDate() : new Date(d));
    
    // Format event date (e.g., "Sep 13, 2025")
    const formatEventDate = (d: any) => (d ? format(toJsDate(d), 'MMM dd, yyyy') : 'TBD');
    
    // Format event time (e.g., "6:00 PM")
    const formatEventTime = (d: any) => (d ? format(toJsDate(d), 'h:mm a') : 'TBD');
    
    // Calculate event duration in hours
    const getEventDuration = () => {
      if (!event.startAt || !event.endAt) return null;
      
      const startDate = toJsDate(event.startAt);
      const endDate = toJsDate(event.endAt);
      
      const durationMs = endDate.getTime() - startDate.getTime();
      const durationHours = Math.round(durationMs / (1000 * 60 * 60) * 10) / 10; // Round to 1 decimal place
      
      return durationHours;
    };
    
    // Check if event is in the past
    const isEventPast = !!event.startAt && toJsDate(event.startAt) < new Date();
    
    // Get formatted date and time strings
    const dateLabel = formatEventDate(event.startAt);
    const timeLabel = event.startAt 
      ? `${formatEventTime(event.startAt)}${event.endAt ? ` - ${formatEventTime(event.endAt)}` : ''}`
      : 'TBD';
    
    // Get duration string
    const durationHours = getEventDuration();
    const durationLabel = durationHours ? ` (${durationHours} hours)` : '';
    
    // Combined time with duration
    const timeWithDuration = timeLabel + durationLabel;
    
    return {
      // Raw data
      startDate: event.startAt ? toJsDate(event.startAt) : null,
      endDate: event.endAt ? toJsDate(event.endAt) : null,
      durationHours,
      isEventPast,
      
      // Formatted strings
      dateLabel,
      timeLabel,
      durationLabel,
      timeWithDuration,
      
      // Helper functions (for backward compatibility)
      formatEventDate,
      formatEventTime,
      getEventDuration,
      toJsDate
    };
  }, [event.startAt, event.endAt]);
};
