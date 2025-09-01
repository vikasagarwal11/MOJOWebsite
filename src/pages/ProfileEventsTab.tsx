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
}) => (
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
    
    {/* RSVPed Events - Main content for all users */}
    <div className="grid gap-4">
      <h2 className="text-sm font-semibold text-gray-700">
        {currentUser?.role === 'admin' ? 'My RSVPed Events' : 'Events I\'m Attending'}
      </h2>
      {loadingEvents ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-2"></div>
          <p className="text-gray-500">Loading events...</p>
        </div>
      ) : rsvpedEvents.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">
            {currentUser?.role === 'admin' 
              ? 'You haven\'t RSVPed to any events yet.' 
              : 'You haven\'t joined any events yet.'}
          </p>
          <p className="text-sm text-gray-400">Find events to join in the Events section!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {rsvpedEvents.map(event => (
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
      {rsvpedEvents.length >= PAGE_SIZE * eventsPage && (
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