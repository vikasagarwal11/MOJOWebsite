import React from 'react';
import { Bell, Calendar, Eye } from 'lucide-react';
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

interface Notification {
  id: string;
  userId: string;
  message: string;
  createdAt: any;
  read: boolean;
  eventId?: string;
}

type ProfileEventsTabProps = {
  notifications: Notification[];
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  rsvpedEvents: Event[];
  userEvents: Event[];
  allEvents: Event[];
  userNames: { [userId: string]: string };

  setIsCreateModalOpen: (value: boolean) => void;
  setEventToEdit: (value: Event | null) => void;
  notificationsPage: number;
  setNotificationsPage: (value: number) => void;
  eventsPage: number;
  setEventsPage: (value: number) => void;
  PAGE_SIZE: number;
  notificationFilter: 'all' | 'unread';
  setNotificationFilter: (value: 'all' | 'unread') => void;
  loadingNotifications: boolean;
  loadingEvents: boolean;
  currentUser: any;
};

export const ProfileEventsTab: React.FC<ProfileEventsTabProps> = ({
  notifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  rsvpedEvents,
  userEvents,
  allEvents,
  userNames,
  setIsCreateModalOpen,
  setEventToEdit,
  notificationsPage,
  setNotificationsPage,
  eventsPage,
  setEventsPage,
  PAGE_SIZE,
  notificationFilter,
  setNotificationFilter,
  loadingNotifications,
  loadingEvents,
  currentUser,
}) => {
  const [dateFilter, setDateFilter] = React.useState<'all' | 'upcoming' | 'past'>('all');
  const [rsvpFilter, setRsvpFilter] = React.useState<'all' | 'going' | 'not-going' | 'pending'>('all');

  // Filter events based on current filters
  const filteredEvents = rsvpedEvents.filter(event => {
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
  }).filter(event => {
    // Status filter - since all events shown are "going", we can filter by status
    if (rsvpFilter === 'all') return true;
    
    // For now, all events shown are "going" status
    // In the future, this could be enhanced to show actual RSVP status from database
    if (rsvpFilter === 'going') return true;
    if (rsvpFilter === 'not-going') return false; // No "not-going" events shown in this view
    if (rsvpFilter === 'pending') return false;  // No "pending" events shown in this view
    
    return true;
  });

  return (
  <div className="grid gap-6">
    {/* Notifications - Only show for event creators */}
    {currentUser?.role === 'admin' && (
      <div className="grid gap-4">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-purple-600" />
          <h2 className="text-sm font-semibold text-gray-700">Notifications</h2>
          {notifications.length > 0 && (
            <button
              onClick={markAllNotificationsAsRead}
              className="ml-4 text-xs text-purple-600 hover:underline"
              aria-label="Mark all notifications as read"
            >
              Mark All as Read
            </button>
          )}
          {notifications.filter(n => !n.read).length > 0 && (
            <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-2 py-1">
              {notifications.filter(n => !n.read).length}
            </span>
          )}
          <select
            value={notificationFilter}
            onChange={(e) => setNotificationFilter(e.target.value as 'all' | 'unread')}
            className="ml-4 px-2 py-1 rounded border border-gray-300 focus:ring-2 focus:ring-purple-500 text-xs"
            aria-label="Filter notifications"
          >
            <option value="all">All</option>
            <option value="unread">Unread</option>
          </select>
        </div>
        {loadingNotifications ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-gray-500">Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <Bell className="w-12 w-12 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">No notifications yet</p>
            <p className="text-sm text-gray-400">You'll see RSVP notifications here when members join your events</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications
              .filter(n => notificationFilter === 'all' || !n.read)
              .map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 rounded-lg border transition-all duration-200 ${notification.read ? 'bg-gray-50 border-gray-200 text-gray-600' : 'bg-purple-50 border-purple-200 text-gray-900'}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{notification.message}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {notification.createdAt?.toDate?.()
                          ? new Date(notification.createdAt.toDate()).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : 'Recently'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {notification.eventId && (
                        <button
                          onClick={() => {
                            const event = [...userEvents, ...allEvents].find(e => e.id === notification.eventId);
                            if (event) setEventToEdit(event);
                            setIsCreateModalOpen(true);
                          }}
                          className="text-xs px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                          aria-label="View event details"
                        >
                          View Event
                        </button>
                      )}
                      {!notification.read && (
                        <button
                          onClick={() => markNotificationAsRead(notification.id)}
                          className="text-xs px-2 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors flex items-center gap-1"
                          aria-label="Mark notification as read"
                        >
                          <Eye className="w-3 h-3" />
                          Read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            {notifications.length >= PAGE_SIZE * notificationsPage && (
                          <button
              onClick={() => setNotificationsPage(notificationsPage + 1)}
              className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-full hover:bg-purple-700"
              aria-label="Load more notifications"
            >
              Load More Notifications
            </button>
            )}
          </div>
        )}
      </div>
    )}
    
    {/* Event Filtering and Quick Actions - For non-admin users */}
    {currentUser?.role !== 'admin' && rsvpedEvents.length > 0 && (
      <>
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

            {/* Status Filter */}
            <div className="flex items-center gap-2">
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
              <span className="text-xs text-gray-500">(Currently shows only "Going" events)</span>
            </div>
          </div>
        </div>


      </>
    )}

    {/* RSVPed Events - Main content for all users */}
    <div className="grid gap-4">
      <h2 className="text-sm font-semibold text-gray-700">
        {currentUser?.role === 'admin' ? 'My RSVPed Events' : 'Events I\'m Attending'}
        {currentUser?.role !== 'admin' && (
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({filteredEvents.length} of {rsvpedEvents.length})
          </span>
        )}
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
              <EventCardNew
                event={event}
                onEdit={currentUser?.role === 'admin' ? () => {
                  setEventToEdit(event);
                  setIsCreateModalOpen(true);
                } : undefined}
              />
            </div>
          ))}
        </div>
      )}
      {filteredEvents.length >= PAGE_SIZE * eventsPage && (
        <button
          onClick={() => setEventsPage(eventsPage + 1)}
          className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-full hover:bg-purple-700"
          aria-label="Load more events"
        >
          Load More Events
        </button>
      )}
    </div>
    
    {/* User-Created Events - Only show for admins */}
    {currentUser?.role === 'admin' && userEvents.length > 0 && (
      <div className="grid gap-4">
        <h2 className="text-sm font-semibold text-gray-700">My Created Events</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {userEvents.map(event => (
            <div key={event.id} className="relative">
              <EventCardNew
                event={{ ...event, createdBy: userNames[event.createdBy] || event.createdBy }}
                onEdit={() => {
                  setEventToEdit(event);
                  setIsCreateModalOpen(true);
                }}
              />
            </div>
          ))}
        </div>
        {userEvents.length >= PAGE_SIZE * eventsPage && (
          <button
            onClick={() => setEventsPage(eventsPage + 1)}
            className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-full hover:bg-purple-700"
            aria-label="Load more events"
          >
            Load More Events
          </button>
        )}
      </div>
    )}
  </div>
  );
};