
import React from 'react';
import { Calendar } from 'lucide-react';
import { EventDoc } from '../hooks/useEvents';
import { tsToDate } from '../lib/firestore';

type Props = {
  event: EventDoc;
  onEdit?: () => void;
  onClick?: () => void;
};

const EventCard: React.FC<Props> = ({ event, onEdit, onClick }) => {
  const start = tsToDate(event.startAt);
  const end = event.endAt ? tsToDate(event.endAt) : new Date(start.getTime() + 60 * 60 * 1000);
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm hover:shadow transition cursor-pointer" onClick={onClick}>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Calendar className="w-4 h-4" />
        <span>{start.toLocaleString()} - {end.toLocaleTimeString()}</span>
      </div>
      <h3 className="mt-2 text-lg font-semibold">{event.title}</h3>
      {event.location && <p className="text-sm text-gray-600">{event.location}</p>}
      {event.tags?.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {event.tags.map((t) => (
            <span key={t} className="px-2 py-0.5 text-xs rounded-full bg-purple-50 text-purple-700 border border-purple-200">
              {t}
            </span>
          ))}
        </div>
      ) : null}
      {event.isTeaser && <div className="mt-3 text-xs text-gray-500">Sign in to see full details</div>}
      {onEdit && (
        <div className="mt-3">
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-sm">
            Edit
          </button>
        </div>
      )}
    </div>
  );
};

export default EventCard;
