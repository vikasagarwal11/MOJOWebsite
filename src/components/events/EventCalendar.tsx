import React, { useMemo } from 'react';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import { format as dfFormat, parse as dfParse, startOfWeek as dfStartOfWeek, getDay as dfGetDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { EventDoc } from '../../hooks/useEvents';
import { tsToDate } from '../../hooks/useEventsUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useUserRSVPs } from '../../hooks/useUserRSVPs';
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
  
  // Extract event IDs for RSVP fetching
  const eventIds = useMemo(() => events.map(e => e.id || '').filter(id => id), [events]);
  
  // Fetch user RSVPs for all events
  const { getRSVPStatus } = useUserRSVPs(eventIds);
  
  const calendarEvents = useMemo(() => events.map((e) => {
    const start = tsToDate(e.startAt);
    let end: Date;
    if (e.endAt) {
      end = tsToDate(e.endAt);
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
          background-color: rgb(147 51 234) !important;
          border-color: rgb(147 51 234) !important;
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
              backgroundColor = '#8b5cf6'; // Purple for public events (no RSVP)
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
