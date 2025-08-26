
import React from 'react';
import { Calendar as BigCalendar, dateFnsLocalizer, View } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import enUS from 'date-fns/locale/en-US';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales: { 'en-US': enUS } });

export type CalendarInstance = {
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource: any;
};

export const EventCalendar: React.FC<{
  instances: Array<{ base: any; start: Date; end: Date }>;
  onSelect: (base: any) => void;
}> = ({ instances, onSelect }) => {
  const events: CalendarInstance[] = React.useMemo(() => {
    return instances.map(({ base, start, end }) => ({
      title: base.title,
      start,
      end,
      allDay: !!base.allDay,
      resource: base,
    }));
  }, [instances]);

  const [view, setView] = React.useState<View>('month');

  return (
    <div className="bg-white rounded-2xl shadow-lg p-4 relative overflow-visible">
      <style>{`
        /* Hide all-day row in time views */
        .rbc-time-view .rbc-allday-cell, .rbc-time-view .rbc-allday-events, .rbc-time-header .rbc-row:first-child {
          display: none !important;
          height: 0 !important;
          min-height: 0 !important;
        }
      `}</style>
      <BigCalendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        onSelectEvent={(ev: any) => onSelect(ev.resource)}
        views={['month', 'week', 'day']}
        defaultView="month"
        onView={(v) => setView(v)}
        style={{ height: 640 }}
        step={30}
        timeslots={2}
        dayLayoutAlgorithm="no-overlap"
        min={new Date(1970,0,1,0,0,0)}
        max={new Date(1970,0,1,23,59,0)}
      />
    </div>
  );
};
