
import React from 'react';
import { EventDoc } from '../hooks/useEvents';
import { tsToDate } from '../lib/firestore';

export const EventCard: React.FC<{
  ev: EventDoc;
  onEdit?: () => void;
  onDelete?: () => void;
  onOpen?: () => void;
}> = ({ ev, onEdit, onDelete, onOpen }) => {
  const start = tsToDate(ev.startAt);
  const end = tsToDate(ev.endAt);
  const range = ev.allDay
    ? `${start.toDateString()}${start.toDateString() !== end.toDateString() ? ' – ' + end.toDateString() : ''}`
    : `${start.toLocaleString()} – ${end.toLocaleTimeString()}`;

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm flex flex-col gap-2">
      {ev.imageUrl && <img src={ev.imageUrl} alt="" className="w-full h-40 object-cover rounded-lg" />}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{ev.title}</h3>
          <div className="text-sm text-gray-600">{range}</div>
          {ev.location && <div className="text-sm text-gray-600">{ev.location}</div>}
          {ev.tags?.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {ev.tags.map(t => <span key={t} className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{t}</span>)}
            </div>
          ) : null}
          {ev.isPaid && (
            <div className="text-sm mt-1">
              <span className="font-medium">Price:</span> {(ev.priceCents||0)/100} {ev.currency || 'USD'}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {onEdit && <button className="px-3 py-1 rounded bg-indigo-600 text-white" onClick={onEdit}>Edit</button>}
          {onDelete && <button className="px-3 py-1 rounded bg-red-600 text-white" onClick={onDelete}>Delete</button>}
        </div>
      </div>
      <div className="mt-2">
        <button className="px-4 py-2 rounded bg-gray-900 text-white" onClick={onOpen}>Details</button>
      </div>
    </div>
  );
};
