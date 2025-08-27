
import React, { useMemo, useState } from 'react';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import { format as dfFormat, parse as dfParse, startOfWeek as dfStartOfWeek, getDay as dfGetDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { EventDoc } from '../hooks/useEvents';
import { tsToDate } from '../lib/firestore';

const localizer = dateFnsLocalizer({
  format: dfFormat,
  parse: dfParse as any,
  startOfWeek: dfStartOfWeek,
  getDay: dfGetDay,
  locales: { 'en-US': enUS },
});

const Legend: React.FC = () => (
  <div className="flex items-center gap-3 text-xs text-gray-600 pb-2">
    <span className="inline-flex items-center gap-1"><i className="inline-block w-3 h-3 rounded bg-purple-600"></i>Public</span>
    <span className="inline-flex items-center gap-1"><i className="inline-block w-3 h-3 rounded bg-red-500"></i>Members/Private</span>
    <span className="inline-flex items-center gap-1"><i className="inline-block w-3 h-3 rounded bg-gray-400"></i>Teaser</span>
  </div>
);

type Props = { events: EventDoc[]; onSelect?: (e: EventDoc) => void; };

const EventCalendar: React.FC<Props> = ({ events, onSelect }) => {
  const [hovered, setHovered] = useState<{x:number;y:number;title:string;time:string}|null>(null);

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
    <div className="bg-white rounded-2xl shadow p-6 relative">
      <Legend />
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
        components={{
          event: ({ event }: any) => (
            <div
              onMouseEnter={(e:any)=>setHovered({ x:e.clientX, y:e.clientY, title:event.title, time: new Date(event.start).toLocaleTimeString() })}
              onMouseLeave={()=>setHovered(null)}
              className="px-1 truncate"
            >
              {event.title}
            </div>
          )
        }}
        onSelectEvent={(ev: any) => onSelect && onSelect(ev.resource as EventDoc)}
      />
      {hovered && (
        <div className="pointer-events-none fixed z-[9999] transform -translate-x-1/2 -translate-y-3 bg-white border rounded shadow px-2 py-1 text-xs"
             style={{ left: hovered.x, top: hovered.y }}>
          <div className="font-medium">{hovered.title}</div>
          <div className="text-gray-500">{hovered.time}</div>
        </div>
      )}
    </div>
  );
};
export default EventCalendar;
