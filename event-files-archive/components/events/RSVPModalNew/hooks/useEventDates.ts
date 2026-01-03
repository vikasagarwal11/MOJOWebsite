import { useMemo } from 'react';
import { safeFormat, safeToDate, safeDifferenceInHours } from '../../../../utils/dateUtils';
import { EventDoc } from '../../../../hooks/useEvents';

/**
 * Hook to handle all event date-related logic and formatting
 * Encapsulates the complex date handling from Firestore Timestamps
 */
export const useEventDates = (event: EventDoc) => {
  return useMemo(() => {
    // Helper to safely convert Firestore Timestamp to Date
    const toJsDate = (d: any) => {
      if (!d) return null;
      
      try {
        // Handle Firestore Timestamp with toDate method
        if (d.toDate && typeof d.toDate === 'function') {
          return d.toDate();
        }
        
        // Handle Firestore Timestamp with seconds property
        if (d.seconds && typeof d.seconds === 'number') {
          return new Date(d.seconds * 1000 + (d.nanoseconds || 0) / 1000000);
        }
        
        // Handle JavaScript Date
        if (d instanceof Date) {
          return d;
        }
        
        // Handle timestamp number (milliseconds)
        if (typeof d === 'number') {
          return new Date(d);
        }
        
        // Handle timestamp string
        if (typeof d === 'string') {
          const date = new Date(d);
          if (isNaN(date.getTime())) {
            console.warn('Invalid date string:', d);
            return null;
          }
          return date;
        }
        
        console.warn('Unknown date format:', d);
        return null;
      } catch (error) {
        console.error('Error converting date:', d, error);
        return null;
      }
    };
    
    // Format event date (e.g., "Sep 13, 2025")
    const formatEventDate = (d: any) => {
      return safeFormat(d, 'MMM dd, yyyy', 'TBD');
    };
    
    // Format event time (e.g., "6:00 PM")
    const formatEventTime = (d: any) => {
      return safeFormat(d, 'h:mm a', 'TBD');
    };
    
    // Calculate event duration in hours
    const getEventDuration = () => {
      if (!event.startAt || !event.endAt) return null;
      
      const hours = safeDifferenceInHours(event.startAt, event.endAt);
      return hours > 0 ? hours : 1;
    };
    
    // Check if event is in the past
    const isEventPast = (() => {
      if (!event.startAt) return false;
      const startDate = safeToDate(event.startAt);
      return startDate ? startDate < new Date() : false;
    })();
    
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
      startDate: safeToDate(event.startAt),
      endDate: safeToDate(event.endAt),
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
      toJsDate: safeToDate
    };
  }, [event.startAt, event.endAt]);
};
