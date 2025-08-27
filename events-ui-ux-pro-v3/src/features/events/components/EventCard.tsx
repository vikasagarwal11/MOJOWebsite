
import React from 'react';
import { Calendar, Share, Pencil, Trash2, Lock } from 'lucide-react';
import { EventDoc } from '../hooks/useEvents';
import { tsToDate } from '../lib/firestore';
import { visibilityPill } from '../lib/useEventsUtils';

type Props = {
  event: EventDoc;
  onEdit?: () => void;
  onDelete?: () => void;
  onClick?: () => void;
  showTopActions?: boolean;
};

const Pill: React.FC<{ tone: 'green'|'purple'|'gray'; children: React.ReactNode }> = ({ tone, children }) => {
  const map = {
    green: 'bg-green-50 text-green-700 border-green-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    gray: 'bg-gray-50 text-gray-700 border-gray-200'
  } as const;
  return <span className={`px-2 py-0.5 text-xs rounded-full border ${map[tone]} whitespace-nowrap`}>{children}</span>;
};

const EventCard: React.FC<Props> = ({ event, onEdit, onDelete, onClick, showTopActions = true }) => {
  const start = tsToDate(event.startAt);
  const end = event.endAt ? tsToDate(event.endAt) : new Date(start.getTime() + 60 * 60 * 1000);
  const vis = visibilityPill(event.visibility);

  return (
    <div className="relative rounded-xl border bg-white p-4 shadow-sm hover:shadow transition cursor-pointer" onClick={onClick}>
      {showTopActions && (
        <div className="absolute right-2 top-2 flex gap-1">
          <button className="p-1 rounded hover:bg-gray-100" title="Share"><Share className="w-4 h-4" /></button>
          {onEdit && <button onClick={(e)=>{e.stopPropagation();onEdit();}} className="p-1 rounded hover:bg-gray-100" title="Edit"><Pencil className="w-4 h-4" /></button>}
          {onDelete && <button onClick={(e)=>{e.stopPropagation();onDelete();}} className="p-1 rounded hover:bg-gray-100" title="Delete"><Trash2 className="w-4 h-4" /></button>}
        </div>
      )}

      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Calendar className="w-4 h-4" />
        <span>{start.toLocaleString()} – {end.toLocaleTimeString()}</span>
      </div>

      <h3 className="mt-2 text-lg font-semibold pr-14">{event.title}</h3>
      {event.location && <p className="text-sm text-gray-600">{event.location}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Pill tone={vis.tone as any}>{vis.text}</Pill>
        {event.maxAttendees != null && <Pill tone="purple">Capacity: {event.maxAttendees}</Pill>}
        {event.allDay && <Pill tone="gray">All day</Pill>}
        {event.tags?.slice(0,3).map(t => <Pill key={t} tone="gray">{t}</Pill>)}
        {event.visibility === 'private' && <Lock className="w-4 h-4 text-gray-400" title="Private" />}
      </div>
      {event.isTeaser && <div className="mt-3 text-xs text-gray-500">Sign in to see full details</div>}
    </div>
  );
};

export default EventCard;
