
import React from 'react';
import EventCard from './EventCard';
import { EventDoc } from '../hooks/useEvents';

type Props = {
  events: EventDoc[];
  loading?: boolean;
  onEdit?: (e: EventDoc) => void;
  onClick?: (e: EventDoc) => void;
  emptyText?: string;
};

const EventList: React.FC<Props> = ({ events, loading, onEdit, onClick, emptyText }) => {
  if (loading) return <div className="text-center py-16 text-gray-500">Loading…</div>;
  if (!events.length) return <div className="text-center py-16 text-gray-500">{emptyText || 'No events found.'}</div>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {events.map((ev) => (
        <EventCard key={ev.id} event={ev} onEdit={onEdit ? () => onEdit(ev) : undefined} onClick={onClick ? () => onClick(ev) : undefined} />
      ))}
    </div>
  );
};
export default EventList;
