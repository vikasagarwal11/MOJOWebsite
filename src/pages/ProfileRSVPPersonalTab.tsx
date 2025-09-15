import React, { useState } from 'react';
import { Calendar, MapPin, Clock, Users } from 'lucide-react';
import EventCardNew from '../components/events/EventCardNew';

interface Event {
  id: string;
  title: string;
  description: string;
  startAt: any;
  endAt?: any;
  location: string;
  createdBy: string;
  attendingCount: number;
  maxAttendees?: number;
  imageUrl?: string;
}

interface RSVP {
  id: string;
  eventId: string;
  status: 'going' | 'not-going' | 'pending';
  updatedAt: any;
  statusHistory?: Array<{
    status: string;
    changedAt: any;
  }>;
}

type ProfileRSVPPersonalTabProps = {
  rsvpedEvents: Event[];
  loadingEvents: boolean;
  currentUser: any;
};

export const ProfileRSVPPersonalTab: React.FC<ProfileRSVPPersonalTabProps> = ({
  rsvpedEvents,
  loadingEvents,
  currentUser,
}) => {
  const [rsvpFilter, setRsvpFilter] = useState<'all' | 'going' | 'not-going' | 'pending'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'upcoming' | 'past'>('all');

  // Filter events based on current filters
  const filteredEvents = rsvpedEvents.filter(event => {
    // Status filter - since all events shown are "going", we can filter by status
    if (rsvpFilter === 'all') return true;
    
    // For now, all events shown are "going" status
    // In the future, this could be enhanced to show actual RSVP status from database
    if (rsvpFilter === 'going') return true;
    if (rsvpFilter === 'not-going') return false; // No "not-going" events shown in this view
    if (rsvpFilter === 'pending') return false;  // No "pending" events shown in this view
    
    return true;
  }).filter(event => {
    // Date filter
    if (dateFilter === 'all') return true;
    
    const eventDate = event.startAt?.toDate?.() ? new Date(event.startAt.toDate()) : new Date();
    const now = new Date();
    
    if (dateFilter === 'upcoming') {
      return eventDate >= now;
    } else if (dateFilter === 'past') {
      return eventDate < now;
    }
    return true;
  });



  return (
    <div className="grid gap-6">


      {/* Event Filtering */}
      <div className="grid gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-semibold text-gray-700">Filter Events</h2>
          
          {/* Date Filter */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as 'all' | 'upcoming' | 'past')}
            className="px-3 py-1 rounded border border-gray-300 focus:ring-2 focus:ring-[#F25129] text-sm"
          >
            <option value="all">All Dates</option>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
          </select>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <select
              value={rsvpFilter}
              onChange={(e) => setRsvpFilter(e.target.value as 'all' | 'going' | 'not-going' | 'pending')}
              className="px-3 py-1 rounded border border-gray-300 focus:ring-2 focus:ring-[#F25129] text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="going">Going</option>
              <option value="not-going">Not Going</option>
              <option value="pending">Pending</option>
            </select>
            <span className="text-xs text-gray-500">(Currently shows only "Going" events)</span>
          </div>
        </div>
      </div>

      {/* Filtered Events List */}
      <div className="grid gap-4">
        <h2 className="text-sm font-semibold text-gray-700">
          {filteredEvents.length === 0 ? 'No Events Found' : `Events (${filteredEvents.length})`}
        </h2>
        
        {loadingEvents ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <div className="animate-spin w-8 h-8 border-4 border-[#F25129] border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-gray-500">Loading events...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">
              {dateFilter === 'upcoming' 
                ? 'No upcoming events found.' 
                : dateFilter === 'past' 
                ? 'No past events found.' 
                : 'No events match your current filters.'}
            </p>
            <p className="text-sm text-gray-400">Try adjusting your filters or join more events!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredEvents.map(event => (
              <div key={event.id} className="relative">
                <EventCardNew event={event} />
                {/* Removed redundant badges - information already shown in event card */}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
        <h3 className="text-sm font-medium text-orange-800 mb-2">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          <button className="px-3 py-1 bg-[#F25129] text-white text-xs rounded-full hover:bg-[#E0451F] transition-colors">
            Export My RSVPs
          </button>
          <button className="px-3 py-1 bg-[#F25129] text-white text-xs rounded-full hover:bg-[#E0451F] transition-colors">
            View Calendar
          </button>
          <button className="px-3 py-1 bg-[#F25129] text-white text-xs rounded-full hover:bg-[#E0451F] transition-colors">
            Share Events
          </button>
        </div>
      </div>
    </div>
  );
};
