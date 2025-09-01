import React, { useState } from 'react';
import { Calendar } from 'lucide-react';
import { deleteDoc, doc, getDocs, getDoc, collection, query, where, limit, addDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import toast from 'react-hot-toast';
import EventCardNew from '../components/events/EventCardNew';
import { useAuth } from '../contexts/AuthContext';

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
  userNames: { [userId: string]: string };
  setEventToEdit: (value: Event | null) => void;
  setIsCreateModalOpen: (value: boolean) => void;
  shareEvent: (event: Event) => Promise<void>;
  blockUserFromRsvp: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
  eventsPage: number;
  setEventsPage: (value: number) => void;
  PAGE_SIZE: number;
  loadingAdminEvents: boolean;
  blockedUsers: { id: string; displayName: string; email: string; blockedAt: any }[];
  loadingBlockedUsers: boolean;
};

export const ProfileAdminTab: React.FC<ProfileAdminTabProps> = ({
  allEvents,
  userNames,
  setEventToEdit,
  setIsCreateModalOpen,
  shareEvent,
  blockUserFromRsvp,
  unblockUser,
  eventsPage,
  setEventsPage,
  PAGE_SIZE,
  loadingAdminEvents,
  blockedUsers,
  loadingBlockedUsers,
}) => {
  const { currentUser } = useAuth();
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFixingStuckProcessing, setIsFixingStuckProcessing] = useState(false);

  // Search users by name or email
  const handleSearchUsers = async () => {
    if (!userSearchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      // Search users in Firestore by displayName or email
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef,
        where('displayName', '>=', userSearchQuery),
        where('displayName', '<=', userSearchQuery + '\uf8ff'),
        limit(10)
      );
      
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          displayName: data?.displayName || 'Unknown User',
          email: data?.email || 'No email',
          blockedFromRsvp: data?.blockedFromRsvp || false
        };
      });
      
      setSearchResults(results);
    } catch (error) {
      console.error('Failed to search users:', error);
      toast.error('Failed to search users');
    } finally {
      setIsSearching(false);
    }
  };

  // Block a user from RSVPing
  const handleBlockUser = async (userId: string) => {
    try {
      // For now, use the old blocking system to maintain compatibility
      await blockUserFromRsvp(userId);
      // Refresh search results to show updated blocked status
      setSearchResults(prev => 
        prev.map(user => 
          user.id === userId 
            ? { ...user, blockedFromRsvp: true }
            : user
        )
      );
    } catch (error) {
      console.error('Failed to block user:', error);
    }
  };

  // Enhanced blocking function
  const handleEnhancedBlock = (user: any) => {
    // This will be connected to the parent component's blocking modal
    if (typeof window !== 'undefined') {
      // Dispatch a custom event to open the blocking modal
      window.dispatchEvent(new CustomEvent('openBlockModal', { 
        detail: { user } 
      }));
    }
  };

  // Fix stuck processing videos
  const handleFixStuckProcessing = async () => {
    setIsFixingStuckProcessing(true);
    try {
      console.log('🔧 Attempting to create manual fix document...');
      console.log('Current user:', currentUser);
      
      // Create a manual fix document to trigger the Cloud Function
      const fixDoc = await addDoc(collection(db, 'manual_fixes'), {
        type: 'reset_stuck_processing',
        timestamp: new Date(),
        triggeredBy: currentUser?.id || 'unknown',
        status: 'pending'
      });
      
      console.log('✅ Manual fix document created successfully:', fixDoc.id);
      toast.success('Stuck processing fix triggered! Check the logs for details.');
      
      // Wait a moment and check if the document was processed
      setTimeout(async () => {
        try {
          const docRef = doc(db, 'manual_fixes', fixDoc.id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            console.log('📊 Manual fix document status:', data);
            if (data.status === 'completed') {
              toast.success('Fix completed successfully!');
            } else if (data.status === 'failed') {
              toast.error(`Fix failed: ${data.error || 'Unknown error'}`);
            }
          }
        } catch (checkError) {
          console.error('Failed to check document status:', checkError);
        }
      }, 3000);
      
    } catch (error: any) {
      console.error('❌ Failed to trigger stuck processing fix:', error);
      console.error('Error details:', {
        code: error?.code,
        message: error?.message,
        details: error?.details
      });
      toast.error(`Failed to trigger fix: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsFixingStuckProcessing(false);
    }
  };

  return (
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
        {allEvents.map((event, index) => (
          <div 
            key={event.id} 
            className={`space-y-4 p-4 rounded-lg ${
              index % 2 === 0 
                ? 'bg-blue-50/50 border-l-4 border-blue-200' 
                : 'bg-pink-50/50 border-l-4 border-pink-200'
            }`}
          >
            {/* EventCard for consistent display - WITH top action icons in Admin tab */}
            <EventCardNew
              event={event}
              onEdit={() => {
                setEventToEdit(event);
                setIsCreateModalOpen(true);
              }}
            />
            
            {/* Top action icons are now displayed in the EventCard header */}
              {/* COMMENTED OUT: Duplicate buttons that were confusing users */}
              {/* 
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
                    // Note: Cloud Functions handle event_teasers cleanup when events are deleted
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
              */}
              
              {/* NEW: Clean, single action buttons with clear labels */}

            {/* Quick Event Info */}
            <div className="border-t border-gray-200 pt-4">
              <div className="text-sm text-gray-600 space-y-1">
                <div className="flex items-center gap-2">
                  <span>👥 Attending:</span>
                  <span className={`font-medium ${
                    (event.attendingCount || 0) <= 0 
                      ? 'text-red-500' 
                      : (event.attendingCount || 0) > 10 
                        ? 'text-green-600' 
                        : 'text-yellow-600'
                  }`}>
                    {/* FIXED: Prevent negative values and show warning for invalid data */}
                    {Math.max(0, event.attendingCount || 0)}
                    {(event.attendingCount || 0) < 0 && (
                      <span className="ml-1 text-xs text-red-600">⚠️ Invalid data</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span>👤 Created by:</span>
                  <span className="font-medium">{userNames[event.createdBy] || event.createdBy || 'Unknown'}</span>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  💡 For detailed RSVP management, use the "RSVP Management" tab
                </div>
              </div>
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
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search users by name or email..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                aria-label="Search users to block"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearchUsers();
                  }
                }}
              />
              <button
                onClick={handleSearchUsers}
                disabled={!userSearchQuery.trim() || isSearching}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                aria-label="Search users"
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
            
            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                <label className="text-sm font-medium text-gray-700">Search Results:</label>
                {searchResults.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{user.displayName || 'Unknown User'}</div>
                      <div className="text-xs text-gray-500">{user.email}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleBlockUser(user.id)}
                        disabled={user.blockedFromRsvp}
                        className={`px-3 py-1 text-xs rounded transition-colors ${
                          user.blockedFromRsvp
                            ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                        title={user.blockedFromRsvp ? 'Already blocked' : 'Block user from RSVPing'}
                      >
                        {user.blockedFromRsvp ? 'Already Blocked' : 'Block RSVP'}
                      </button>
                      <button
                        onClick={() => handleEnhancedBlock(user)}
                        className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                        title="Enhanced blocking options"
                      >
                        Advanced Block
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
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
              💡 Tip: Blocked users cannot RSVP to any events
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

    {/* System Maintenance Tools */}
    <div className="mt-8 p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-lg font-semibold text-gray-900">System Maintenance</h3>
        <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full font-medium">
          System Tools
        </span>
      </div>
      
      <div className="space-y-4">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h4 className="font-medium text-yellow-800 mb-2">FFmpeg Pipeline Fix</h4>
          <p className="text-sm text-yellow-700 mb-3">
            If videos are stuck in "processing" state, this will reset them to the correct status.
          </p>
          <button
            onClick={handleFixStuckProcessing}
            disabled={isFixingStuckProcessing}
            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
          >
            {isFixingStuckProcessing ? 'Fixing...' : 'Fix Stuck Processing Videos'}
          </button>
        </div>
      </div>
    </div>
  </div>
  );
};