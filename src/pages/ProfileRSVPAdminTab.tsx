import React from 'react';
import { Calendar } from 'lucide-react';

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

type ProfileRSVPAdminTabProps = {
  rsvpsByEvent: { [eventId: string]: any[] };
  allEvents: Event[];
  userNames: { [userId: string]: string };
  updateRsvp: (eventId: string, userId: string, status: 'going' | 'maybe' | 'not-going' | null) => Promise<void>;
  exportRsvps: (event: Event) => Promise<void>;
  exportingRsvps: string | null;
  adjustAttendingCount: (eventId: string, increment: boolean) => Promise<void>;
  blockUserFromRsvp: (userId: string) => Promise<void>;
  analyzeLastMinuteChanges: (rsvp: any, eventStart: any) => number;
  rsvpFilter: 'all' | 'going' | 'maybe' | 'not-going';
  setRsvpFilter: (value: 'all' | 'going' | 'maybe' | 'not-going') => void;
  eventsPage: number;
  setEventsPage: (value: number) => void;
  PAGE_SIZE: number;
  loadingAdminEvents: boolean;
  currentUser: any;
};

export const ProfileRSVPAdminTab: React.FC<ProfileRSVPAdminTabProps> = ({
  rsvpsByEvent,
  allEvents,
  userNames,
  updateRsvp,
  exportRsvps,
  exportingRsvps,
  adjustAttendingCount,
  blockUserFromRsvp,
  analyzeLastMinuteChanges,
  rsvpFilter,
  setRsvpFilter,
  eventsPage,
  setEventsPage,
  PAGE_SIZE,
  loadingAdminEvents,
  currentUser,
}) => (
  <div className="grid gap-6">
    <div className="flex items-center gap-2">
      <h2 className="text-sm font-semibold text-gray-700">RSVP Management & Analytics</h2>
      <button
        onClick={() => setRsvpFilter('all')}
        className="ml-4 text-xs text-purple-600 hover:underline"
        aria-label="Reset RSVP filter"
      >
        Reset Filter
      </button>
    </div>
    {/* RSVP Analytics Dashboard */}
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📊</span>
          <div>
            <div className="text-sm text-green-600 font-medium">Total RSVPs</div>
            <div className="text-2xl font-bold text-green-800">
              {Object.values(rsvpsByEvent).reduce((sum, rsvps) => sum + rsvps.length, 0)}
            </div>
          </div>
        </div>
      </div>
      <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✅</span>
          <div>
            <div className="text-sm text-blue-600 font-medium">Going</div>
            <div className="text-2xl font-bold text-blue-800">
              {Object.values(rsvpsByEvent).reduce((sum, rsvps) => sum + rsvps.filter(r => r.status === 'going').length, 0)}
            </div>
          </div>
        </div>
      </div>
      <div className="p-4 bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg border border-yellow-200">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🤔</span>
          <div>
            <div className="text-sm text-yellow-600 font-medium">Maybe</div>
            <div className="text-2xl font-bold text-yellow-800">
              {Object.values(rsvpsByEvent).reduce((sum, rsvps) => sum + rsvps.filter(r => r.status === 'maybe').length, 0)}
            </div>
          </div>
        </div>
      </div>
      <div className="p-4 bg-gradient-to-br from-red-50 to-red-100 rounded-lg border border-red-200">
        <div className="flex items-center gap-2">
          <span className="text-2xl">❌</span>
          <div>
            <div className="text-sm text-red-600 font-medium">Not Going</div>
            <div className="text-2xl font-bold text-red-800">
              {Object.values(rsvpsByEvent).reduce((sum, rsvps) => sum + rsvps.filter(r => r.status === 'not-going').length, 0)}
            </div>
          </div>
        </div>
      </div>
    </div>
    {/* Last-Minute Changes Alert */}
    {(() => {
      const lastMinuteChanges = Object.values(rsvpsByEvent).flat().filter(rsvp => {
        const event = allEvents.find(e => e.id === rsvp.eventId);
        if (!event || !event.startAt) return false;
        return analyzeLastMinuteChanges(rsvp, event.startAt) > 0;
      });
      if (lastMinuteChanges.length > 0) {
        return (
          <div className="p-4 bg-gradient-to-r from-orange-50 to-red-50 rounded-lg border border-orange-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">⚠️</span>
              <h3 className="font-semibold text-orange-800">Last-Minute Changes Alert</h3>
            </div>
            <p className="text-sm text-orange-700 mb-3">
              {lastMinuteChanges.length} user(s) changed their RSVP to "Not Going" within 24 hours of event start
            </p>
            <div className="space-y-2">
              {lastMinuteChanges.slice(0, 3).map(rsvp => {
                const event = allEvents.find(e => e.id === rsvp.eventId);
                const userName = userNames[rsvp.id] || 'Unknown User';
                return (
                  <div key={rsvp.id} className="text-xs text-orange-600 bg-white p-2 rounded border">
                    <strong>{userName}</strong> changed RSVP for <strong>{event?.title}</strong> to "Not Going"
                  </div>
                );
              })}
              {lastMinuteChanges.length > 3 && (
                <div className="text-xs text-orange-600">
                  ...and {lastMinuteChanges.length - 3} more changes
                </div>
              )}
            </div>
          </div>
        );
      }
      return null;
    })()}
    {/* User Blocking Section */}
    {currentUser?.role === 'admin' && (
      <div className="p-6 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          🚫 User Management
          <span className="text-sm font-normal text-gray-600">(Admin Only)</span>
        </h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-700 mb-3">Blocked Users</h4>
            <div className="space-y-2">
              {Object.entries(userNames).map(([userId, userName]) => (
                <div key={userId} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div>
                    <div className="font-medium text-sm">{userName}</div>
                    <div className="text-xs text-gray-500">{userId.slice(0, 8)}...</div>
                  </div>
                  <button
                    onClick={() => blockUserFromRsvp(userId)}
                    className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                    title="Block user from RSVPing"
                  >
                    Block
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 mb-3">RSVP Status History</h4>
            <p className="text-sm text-gray-600 mb-3">
              Track all RSVP changes with timestamps and user details
            </p>
            <div className="text-xs text-gray-500">
              • Status changes are logged automatically<br />
              • Last-minute cancellations are highlighted<br />
              • Full audit trail for compliance
            </div>
          </div>
        </div>
      </div>
    )}
    {/* Events with RSVP Management */}
    {loadingAdminEvents ? (
      <div className="text-center py-8 bg-gray-50 rounded-lg">
        <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-2"></div>
        <p className="text-gray-500">Loading admin events...</p>
      </div>
    ) : allEvents.length === 0 ? (
      <div className="text-center py-8 bg-gray-50 rounded-lg">
        <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-600">No events found</p>
        <p className="text-xs text-gray-400">Create an event to start managing RSVPs</p>
      </div>
    ) : (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-gray-800">Event RSVP Details</h3>
        {allEvents.map(event => (
          <div key={event.id} className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="font-semibold text-lg text-gray-900">{event.title}</h3>
                <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span>
                    📅 {event.startAt?.toDate?.()
                      ? new Date(event.startAt.toDate()).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : 'Date TBD'}
                  </span>
                  <span>
                    👥 Attending:
                    <span className={`font-medium ml-1 ${
                      (event.attendingCount || 0) === 0 ? 'text-red-500' : 'text-green-600'
                    }`}>
                      {event.attendingCount || 0}
                    </span>
                  </span>
                  <span>👤 Created by: {userNames[event.createdBy] || event.createdBy || 'Unknown'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
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
            onClick={() => setEventsPage(p => p + 1)}
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