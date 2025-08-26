import React, { useMemo } from 'react';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import { format as dfFormat, parse as dfParse, startOfWeek as dfStartOfWeek, getDay as dfGetDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { EventDoc } from '../../hooks/useEvents';
import { tsToDate } from '../../hooks/useEventsUtils';

const localizer = dateFnsLocalizer({
  format: dfFormat,
  parse: dfParse as any,
  startOfWeek: dfStartOfWeek,
  getDay: dfGetDay,
  locales: { 'en-US': enUS },
});

type Props = { events: EventDoc[]; onSelect?: (e: EventDoc) => void; };

const EventCalendar: React.FC<Props> = ({ events, onSelect }) => {
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
    return { title: e.title, start, end, allDay: !!e.allDay, resource: e };
  }), [events]);

  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <BigCalendar
        localizer={localizer}
        events={calendarEvents}
        startAccessor="start"
        endAccessor="end"
        views={['month', 'week', 'day']}
        defaultView="month"
        style={{ height: 600 }}
        eventPropGetter={(ev: any) => {
          const r: EventDoc = ev.resource;
          const isTeaser = !!r.isTeaser;
          const isPublic = r.visibility === 'public';
          return {
            className: isTeaser ? 'bg-gray-400 opacity-70' : isPublic ? 'bg-purple-600' : 'bg-red-500',
            style: { color: 'white', border: 'none' },
          };
        }}
        onSelectEvent={(ev: any) => onSelect && onSelect(ev.resource as EventDoc)}
      />
    </div>
  );
};
export default EventCalendar;
