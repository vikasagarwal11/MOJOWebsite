
import React from 'react';
import EventCard from './EventCard';
import { EventDoc } from '../hooks/useEvents';

type Props = {
  events: EventDoc[];
  loading?: boolean;
  onEdit?: (e: EventDoc) => void;
  onClick?: (e: EventDoc) => void;
  onDelete?: (e: EventDoc) => void;
  emptyText?: string;
};

const EventList: React.FC<Props> = ({ events, loading, onEdit, onClick, onDelete, emptyText }) => {
  if (loading) return <div className="text-center py-16 text-gray-500">Loading…</div>;
  if (!events.length) return (
    <div className="rounded-xl border bg-white p-8 text-center text-gray-600">
      {emptyText || 'No events match your filters.'}
      <div className="text-sm text-gray-400 mt-2">Try clearing filters or switching tabs.</div>
    </div>
  );
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {events.map((ev) => (
        <EventCard key={ev.id} event={ev}
          onEdit={onEdit ? () => onEdit(ev) : undefined}
          onDelete={onDelete ? () => onDelete(ev) : undefined}
          onClick={onClick ? () => onClick(ev) : undefined}
        />
      ))}
    </div>
  );
};
export default EventList;
