import React, { useMemo, useCallback } from 'react';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import { format as dfFormat, parse as dfParse, startOfWeek as dfStartOfWeek, getDay as dfGetDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { EventDoc } from '../../hooks/useEvents';
import { safeToDate } from '../../utils/dateUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useAttendees } from '../../hooks/useAttendees';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = dateFnsLocalizer({
  format: dfFormat,
  parse: dfParse as any,
  startOfWeek: dfStartOfWeek,
  getDay: dfGetDay,
  locales: { 'en-US': enUS },
});

type Props = { 
  events: EventDoc[]; 
  onSelect?: (e: EventDoc) => void; 
};

const EventCalendar: React.FC<Props> = ({ events, onSelect }) => {
  const { currentUser } = useAuth();
  
  // For calendar view, we'll get RSVP status from the first event's attendees
  // This is a simplified approach - in a full implementation, you might want to
  // fetch attendees for all events or use a different strategy
  const firstEventId = events[0]?.id;
  const { attendees: firstEventAttendees } = useAttendees(firstEventId || '', currentUser?.id || '');
  
  // Helper function to get RSVP status for an event
  const getRSVPStatus = useCallback((eventId: string): 'going' | 'not-going' | null => {
    if (!currentUser || eventId !== firstEventId) return null;
    
    const userAttendee = firstEventAttendees.find(a => 
      a.userId === currentUser.id && a.attendeeType === 'primary'
    );
    
    if (!userAttendee) return null;
    
    // Only return 'going' or 'not-going', filter out 'pending'
    if (userAttendee.rsvpStatus === 'going' || userAttendee.rsvpStatus === 'not-going') {
      return userAttendee.rsvpStatus;
    }
    
    return null;
  }, [currentUser, firstEventId, firstEventAttendees]);
  
  const calendarEvents = useMemo(() => events.map((e) => {
    const start = safeToDate(e.startAt) || new Date();
    let end: Date;
    if (e.endAt) {
      end = safeToDate(e.endAt) || new Date(start.getTime() + 60 * 60 * 1000);
      if (end <= start) end = new Date(start.getTime() + 60 * 60 * 1000);
    } else if (e.duration) {
      end = new Date(start.getTime() + e.duration * 60 * 1000);
    } else {
      end = new Date(start.getTime() + 60 * 60 * 1000);
    }
    
    // Enhanced title with capacity info (simplified for now)
    let title = e.title;
    if (e.maxAttendees) {
      title = `${e.title} (Max: ${e.maxAttendees})`;
    }
    
    return { title, start, end, allDay: !!e.allDay, resource: e };
  }), [events]);

  return (
    <div className="bg-white rounded-2xl shadow-lg p-4 relative overflow-visible">
      {/* Custom CSS to hide all-day row in time views for cleaner appearance */}
      <style>{`
        /* Hide all-day row in time views (week/day) */
        .rbc-time-view .rbc-allday-cell, 
        .rbc-time-view .rbc-allday-events, 
        .rbc-time-header .rbc-row:first-child {
          display: none !important;
          height: 0 !important;
          min-height: 0 !important;
        }
        
        /* Better event spacing in month view */
        .rbc-month-view .rbc-event {
          margin: 1px 2px;
          border-radius: 4px;
        }
        
        /* Style the built-in toolbar to match our design */
        .rbc-toolbar {
          margin-bottom: 1rem;
        }
        
        .rbc-toolbar button {
          border-radius: 0.375rem;
          font-weight: 500;
          transition: all 0.2s;
        }
        
        .rbc-toolbar button.rbc-active {
          background-color: #F25129 !important;
          border-color: #F25129 !important;
        }
      `}</style>
      
      <BigCalendar
        localizer={localizer}
        events={calendarEvents}
        startAccessor="start"
        endAccessor="end"
        views={['month', 'week', 'day']}
        defaultView="month"
        style={{ height: 640 }}
        
        step={30}
        timeslots={2}
        dayLayoutAlgorithm="no-overlap"
        eventPropGetter={(ev: any) => {
          const event: EventDoc = ev.resource;
          const isTeaser = !!event.isTeaser;
          const isPublic = event.visibility === 'public';
          
          // Get user's RSVP status for color coding
          const userRSVPStatus = getRSVPStatus(event.id || '');
          
          // Color coding based on RSVP status and event type
          let backgroundColor = '#6b7280'; // Default gray for teasers
          
          if (!isTeaser) {
            if (userRSVPStatus === 'going') {
              backgroundColor = '#10b981'; // Green for "Going"
            } else if (userRSVPStatus === 'not-going') {
              backgroundColor = '#ef4444'; // Red for "Not Going"
            } else if (isPublic) {
              backgroundColor = '#F25129'; // Coral for public events (no RSVP)
            } else {
              backgroundColor = '#dc2626'; // Red for members-only events (no RSVP)
            }
          }
          
          return {
            className: isTeaser ? 'bg-gray-400 opacity-70' : '',
            style: { 
              color: 'white', 
              backgroundColor,
              fontWeight: '500',
              fontSize: '0.875rem'
            },
          };
        }}
        onSelectEvent={(ev: any) => onSelect && onSelect(ev.resource as EventDoc)}
      />
    </div>
  );
};

export default EventCalendar;
