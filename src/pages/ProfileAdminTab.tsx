import React from 'react';
import { Calendar } from 'lucide-react';
import { deleteDoc, doc, getDocs, collection } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import toast from 'react-hot-toast';
import EventCard from '../components/events/EventCard';

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

type ProfileAdminTabProps = {
  allEvents: Event[];
  rsvpsByEvent: { [eventId: string]: any[] };
  userNames: { [userId: string]: string };
  setEventToEdit: (value: Event | null) => void;
  setIsCreateModalOpen: (value: boolean) => void;
  shareEvent: (event: Event) => Promise<void>;
  adjustAttendingCount: (eventId: string, increment: boolean) => Promise<void>;
  exportRsvps: (event: Event) => Promise<void>;
  exportingRsvps: string | null;
  updateRsvp: (eventId: string, userId: string, status: 'going' | 'maybe' | 'not-going' | null) => Promise<void>;
  blockUserFromRsvp: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
  analyzeLastMinuteChanges: (rsvp: any, eventStart: any) => number;
  eventsPage: number;
  setEventsPage: (value: number) => void;
  PAGE_SIZE: number;
  loadingAdminEvents: boolean;
  rsvpFilter: 'all' | 'going' | 'maybe' | 'not-going';
  setRsvpFilter: (value: 'all' | 'going' | 'maybe' | 'not-going') => void;
  blockedUsers: { id: string; displayName: string; email: string; blockedAt: any }[];
  loadingBlockedUsers: boolean;
};

export const ProfileAdminTab: React.FC<ProfileAdminTabProps> = ({
  allEvents,
  rsvpsByEvent,
  userNames,
  setEventToEdit,
  setIsCreateModalOpen,
  shareEvent,
  adjustAttendingCount,
  exportRsvps,
  exportingRsvps,
  updateRsvp,
  blockUserFromRsvp,
  unblockUser,
  analyzeLastMinuteChanges,
  eventsPage,
  setEventsPage,
  PAGE_SIZE,
  loadingAdminEvents,
  rsvpFilter,
  setRsvpFilter,
  blockedUsers,
  loadingBlockedUsers,
}) => (
  <div className="grid gap-6">
    <div className="flex items-center gap-2">
      <h2 className="text-sm font-semibold text-gray-700">Admin Event Management</h2>
      <button
        onClick={() => {
          setEventToEdit(null);
          setIsCreateModalOpen(true);
        }}
        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-full hover:from-purple-700 hover:to-pink-700"
        aria-label="Create new event"
      >
        Create New Event
      </button>
    </div>
    {loadingAdminEvents ? (
      <div className="text-center py-8 bg-gray-50 rounded-lg">
        <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-2"></div>
        <p className="text-gray-500">Loading admin events...</p>
      </div>
    ) : allEvents.length === 0 ? (
      <div className="text-center py-8 bg-gray-50 rounded-lg">
        <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
        <p className="text-gray-500">No events found</p>
      </div>
    ) : (
      <div className="space-y-6">
        {allEvents.map(event => (
          <div key={event.id} className="space-y-4">
            {/* EventCard for consistent display */}
            <EventCard
              event={event}
              onEdit={() => {
                setEventToEdit(event);
                setIsCreateModalOpen(true);
              }}
            />
            
            {/* Admin Action Buttons */}
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => {
                  setEventToEdit(event);
                  setIsCreateModalOpen(true);
                }}
                className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors text-sm"
                aria-label={`Edit ${event.title}`}
              >
                ✏️ Edit Event
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Are you sure you want to delete "${event.title}"? This cannot be undone.`)) return;
                  try {
                    await deleteDoc(doc(db, 'events', event.id));
                    await deleteDoc(doc(db, 'event_teasers', event.id)).catch(() => {});
                    const rsvps = await getDocs(collection(db, 'events', event.id, 'rsvps'));
                    for (const rsvp of rsvps.docs) {
                      await deleteDoc(rsvp.ref);
                    }
                    if (event.imageUrl) {
                      const imageRef = ref(storage, `events/${event.id}/${event.imageUrl.split('/').pop()}`);
                      await deleteObject(imageRef).catch(() => {});
                    }
                    toast.success('Event deleted');
                  } catch (e: any) {
                    toast.error(e?.message || 'Failed to delete event');
                  }
                }}
                className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm"
                aria-label={`Delete ${event.title}`}
              >
                🗑️ Delete Event
              </button>
              <button
                onClick={() => shareEvent(event)}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
                aria-label={`Share ${event.title}`}
              >
                📤 Share Event
              </button>
            </div>
            {/* RSVP Management Section */}
            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                📋 RSVP Management
                <span className="text-xs text-gray-500 font-normal">
                  ({rsvpsByEvent[event.id]?.length || 0} total responses)
                </span>
              </h4>
              {rsvpsByEvent[event.id]?.length ? (
                <>
                  {/* RSVP Summary Dashboard */}
                  <div className="mb-4 p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700">Response Summary</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => adjustAttendingCount(event.id, true)}
                          className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors"
                          aria-label={`Increase attendance count for ${event.title}`}
                        >
                          ➕ Count
                        </button>
                        <button
                          onClick={() => adjustAttendingCount(event.id, false)}
                          disabled={event.attendingCount <= 0}
                          className={`px-2 py-1 rounded text-xs transition-colors ${
                            event.attendingCount <= 0
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-red-600 text-white hover:bg-red-700'
                          }`}
                          title={event.attendingCount <= 0 ? 'Cannot decrease below 0' : 'Decrease attendance count'}
                          aria-label={`Decrease attendance count for ${event.title}`}
                        >
                          ➖ Count {event.attendingCount <= 0 && '(0)'}
                        </button>
                        <button
                          onClick={() => exportRsvps(event)}
                          disabled={exportingRsvps === event.id}
                          className={`px-2 py-1 rounded text-xs transition-colors ${
                            exportingRsvps === event.id
                              ? 'bg-gray-400 cursor-not-allowed'
                              : 'bg-purple-600 hover:bg-purple-700'
                          } text-white`}
                          aria-label={`Export RSVPs for ${event.title}`}
                        >
                          {exportingRsvps === event.id ? '⏳ Exporting...' : '📊 Export CSV'}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                        <span>Going: <strong>{rsvpsByEvent[event.id].filter(r => r.status === 'going').length}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                        <span>Maybe: <strong>{rsvpsByEvent[event.id].filter(r => r.status === 'maybe').length}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                        <span>Not Going: <strong>{rsvpsByEvent[event.id].filter(r => r.status === 'not-going').length}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                        <span>Total: <strong>{rsvpsByEvent[event.id].length}</strong></span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="text-xs text-gray-600 space-y-1">
                        <div>
                          <span className="font-medium text-green-700">Going:</span>{' '}
                          {rsvpsByEvent[event.id]
                            .filter(r => r.status === 'going')
                            .map(r => userNames[r.id] || 'Loading...')
                            .join(', ') || 'None'}
                        </div>
                        <div>
                          <span className="font-medium text-yellow-700">Maybe:</span>{' '}
                          {rsvpsByEvent[event.id]
                            .filter(r => r.status === 'maybe')
                            .map(r => userNames[r.id] || 'Loading...')
                            .join(', ') || 'None'}
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Detailed RSVP List */}
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mt-4">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">Detailed RSVP List</span>
                      <select
                        value={rsvpFilter}
                        onChange={(e) => setRsvpFilter(e.target.value as 'all' | 'going' | 'maybe' | 'not-going')}
                        className="px-2 py-1 rounded border border-gray-300 focus:ring-2 focus:ring-purple-500 text-xs"
                        aria-label="Filter RSVPs"
                      >
                        <option value="all">All</option>
                        <option value="going">Going</option>
                        <option value="maybe">Maybe</option>
                        <option value="not-going">Not Going</option>
                      </select>
                    </div>
                    <ul className="divide-y divide-gray-200 max-h-60 overflow-y-auto">
                      {rsvpsByEvent[event.id]
                        .filter(r => rsvpFilter === 'all' || r.status === rsvpFilter)
                        .map(rsvp => (
                          <li key={rsvp.id} className="px-4 py-3 flex justify-between items-center hover:bg-gray-50">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm text-gray-900">
                                  {userNames[rsvp.id] || 'Loading...'}
                                </span>
                                <span className="text-xs text-gray-400">({rsvp.id.slice(0, 8)}...)</span>
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    rsvp.status === 'going'
                                      ? 'bg-green-100 text-green-800'
                                      : rsvp.status === 'maybe'
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}
                                >
                                  {rsvp.status === 'going' ? '✅ Going' : rsvp.status === 'maybe' ? '🤔 Maybe' : '❌ Not Going'}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                                <span>
                                  📅 RSVP:{' '}
                                  {rsvp.createdAt?.toDate?.()
                                    ? new Date(rsvp.createdAt.toDate()).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })
                                    : 'Unknown'}
                                </span>
                                {rsvp.updatedAt && (
                                  <span>
                                    🔄 Updated:{' '}
                                    {new Date(rsvp.updatedAt.toDate()).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <select
                                value={rsvp.status}
                                onChange={(e) => {
                                  const newStatus = e.target.value as 'going' | 'maybe' | 'not-going' | '';
                                  updateRsvp(event.id, rsvp.id, newStatus || null);
                                }}
                                className="px-2 py-1 rounded border border-gray-300 focus:ring-2 focus:ring-purple-500 text-xs"
                                aria-label={`Change RSVP status for ${userNames[rsvp.id] || rsvp.id}`}
                              >
                                <option value="going">✅ Going</option>
                                <option value="maybe">🤔 Maybe</option>
                                <option value="not-going">❌ Not Going</option>
                                <option value="">🗑️ Remove</option>
                              </select>
                              {analyzeLastMinuteChanges(rsvp, event.startAt) > 0 && (
                                <button
                                  onClick={() => blockUserFromRsvp(rsvp.id)}
                                  className="ml-2 px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-xs"
                                  aria-label={`Block ${userNames[rsvp.id] || rsvp.id} from RSVPing`}
                                >
                                  Block
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                    </ul>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <span className="text-4xl">📭</span>
                  <p className="text-sm text-gray-600 mt-2">No RSVPs yet for this event</p>
                  <p className="text-xs text-gray-500">Responses will appear here as members RSVP</p>
                </div>
              )}
            </div>
          </div>
        ))}
        {allEvents.length >= PAGE_SIZE * eventsPage && (
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

    {/* User Blocking Management Section */}
    <div className="mt-8 p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-lg font-semibold text-gray-900">User Blocking Management</h3>
        <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full font-medium">
          Admin Only
        </span>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        {/* Block User Section */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-700">Block User from RSVPing</h4>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Search users by name or email..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              aria-label="Search users to block"
            />
            <button
              onClick={() => {
                // TODO: Implement user search and blocking
                toast.success('User blocking functionality coming soon');
              }}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              aria-label="Block selected user from RSVPing"
            >
              🔒 Block User from RSVPing
            </button>
            <div className="text-xs text-gray-500">
              💡 Tip: Use the "Block" button next to RSVPs to quickly block users
            </div>
          </div>
        </div>

        {/* Blocked Users List */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-700">Currently Blocked Users</h4>
          {loadingBlockedUsers ? (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full mx-auto mb-2"></div>
                <p className="text-sm text-gray-500">Loading blocked users...</p>
              </div>
            </div>
          ) : blockedUsers.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-center py-8">
                <span className="text-4xl">🚫</span>
                <p className="text-sm text-gray-600 mt-2">No blocked users</p>
                <p className="text-xs text-gray-500">Users blocked from RSVPing will appear here</p>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="space-y-3">
                {blockedUsers.map(user => (
                  <div key={user.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                    <div className="flex-1">
                      <div className="font-medium text-sm text-gray-900">
                        {user.displayName || userNames[user.id] || 'Unknown User'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {user.email || 'No email'}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Blocked: {user.blockedAt?.toDate?.() 
                          ? new Date(user.blockedAt.toDate()).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })
                          : 'Unknown date'}
                      </div>
                    </div>
                    <button
                      onClick={() => unblockUser(user.id)}
                      className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-xs"
                      aria-label={`Unblock ${user.displayName || userNames[user.id] || 'user'}`}
                    >
                      🔓 Unblock
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-start gap-2">
          <span className="text-yellow-600">⚠️</span>
          <div className="text-sm text-yellow-800">
            <p className="font-medium">User Blocking Guidelines:</p>
            <ul className="mt-1 space-y-1 text-xs">
              <li>• Block users who repeatedly abuse RSVP system</li>
              <li>• Block users who make last-minute cancellations</li>
              <li>• Block users who violate community guidelines</li>
              <li>• Blocked users cannot RSVP to any events</li>
              <li>• Blocking can be reversed by admins</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
);