
import React from 'react';
import { EventDoc } from '../hooks/useEvents';
import { EventCard } from './EventCard';

export const EventList: React.FC<{
  events: EventDoc[];
  onEdit: (ev: EventDoc) => void;
  onDelete: (ev: EventDoc) => void;
  onOpen: (ev: EventDoc) => void;
}> = ({ events, onEdit, onDelete, onOpen }) => {
  if (!events.length) {
    return (
      <div className="text-center py-16 text-gray-600">
        No events found.
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {events.map(ev => (
        <EventCard
          key={ev.id}
          ev={ev}
          onEdit={() => onEdit(ev)}
          onDelete={() => onDelete(ev)}
          onOpen={() => onOpen(ev)}
        />
      ))}
    </div>
  );
};
