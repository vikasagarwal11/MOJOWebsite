import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Clock, Users, TrendingUp, TrendingDown } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
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
  const [showAdvancedStats, setShowAdvancedStats] = useState(false);

  // Filter events based on current filters
  const filteredEvents = rsvpedEvents.filter(event => {
    // Status filter (this would need to be implemented with actual RSVP data)
    // For now, we'll show all events
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

  // Calculate basic stats
  const totalEvents = rsvpedEvents.length;
  const upcomingEvents = rsvpedEvents.filter(event => {
    const eventDate = event.startAt?.toDate?.() ? new Date(event.startAt.toDate()) : new Date();
    return eventDate >= new Date();
  }).length;
  const pastEvents = totalEvents - upcomingEvents;

  // Calculate attendance rate (assuming all shown events are ones user RSVPed to)
  const attendanceRate = totalEvents > 0 ? Math.round((upcomingEvents / totalEvents) * 100) : 0;

  return (
    <div className="grid gap-6">
      {/* RSVP Analytics */}
      <div className="grid gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">My RSVP Analytics</h2>
          <button
            onClick={() => setShowAdvancedStats(!showAdvancedStats)}
            className="text-xs text-purple-600 hover:underline"
          >
            {showAdvancedStats ? 'Hide' : 'Show'} Advanced Stats
          </button>
        </div>
        
        {/* Basic Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-600" />
              <span className="text-sm font-medium text-gray-600">Total Events</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-2">{totalEvents}</p>
          </div>
          
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-gray-600">Upcoming</span>
            </div>
            <p className="text-2xl font-bold text-green-600 mt-2">{upcomingEvents}</p>
          </div>
          
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-gray-600" />
              <span className="text-sm font-medium text-gray-600">Past</span>
            </div>
            <p className="text-2xl font-bold text-gray-600 mt-2">{pastEvents}</p>
          </div>
          
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-600">Attendance Rate</span>
            </div>
            <p className="text-2xl font-bold text-blue-600 mt-2">{attendanceRate}%</p>
          </div>
        </div>

        {/* Advanced Stats */}
        {showAdvancedStats && (
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Advanced Statistics</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Most Active Month:</p>
                <p className="font-medium">Coming soon...</p>
              </div>
              <div>
                <p className="text-gray-600">Favorite Event Type:</p>
                <p className="font-medium">Coming soon...</p>
              </div>
              <div>
                <p className="text-gray-600">Average Events per Month:</p>
                <p className="font-medium">Coming soon...</p>
              </div>
              <div>
                <p className="text-gray-600">Last RSVP Change:</p>
                <p className="font-medium">Coming soon...</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Event Filtering */}
      <div className="grid gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-semibold text-gray-700">Filter Events</h2>
          
          {/* Date Filter */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as 'all' | 'upcoming' | 'past')}
            className="px-3 py-1 rounded border border-gray-300 focus:ring-2 focus:ring-purple-500 text-sm"
          >
            <option value="all">All Dates</option>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
          </select>

          {/* Status Filter - Placeholder for future implementation */}
          <select
            value={rsvpFilter}
            onChange={(e) => setRsvpFilter(e.target.value as 'all' | 'going' | 'not-going' | 'pending')}
            className="px-3 py-1 rounded border border-gray-300 focus:ring-2 focus:ring-purple-500 text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="going">Going</option>
            <option value="not-going">Not Going</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      {/* Filtered Events List */}
      <div className="grid gap-4">
        <h2 className="text-sm font-semibold text-gray-700">
          {filteredEvents.length === 0 ? 'No Events Found' : `Events (${filteredEvents.length})`}
        </h2>
        
        {loadingEvents ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-2"></div>
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
                <div className="absolute top-4 right-4 flex gap-2">
                  {/* Event Status Badge */}
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                    Going
                  </span>
                  
                  {/* Event Date Badge */}
                  {event.startAt?.toDate && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                      {new Date(event.startAt.toDate()).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
        <h3 className="text-sm font-medium text-purple-800 mb-2">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          <button className="px-3 py-1 bg-purple-600 text-white text-xs rounded-full hover:bg-purple-700 transition-colors">
            Export My RSVPs
          </button>
          <button className="px-3 py-1 bg-purple-600 text-white text-xs rounded-full hover:bg-purple-700 transition-colors">
            View Calendar
          </button>
          <button className="px-3 py-1 bg-purple-600 text-white text-xs rounded-full hover:bg-purple-700 transition-colors">
            Share Events
          </button>
        </div>
      </div>
    </div>
  );
};
