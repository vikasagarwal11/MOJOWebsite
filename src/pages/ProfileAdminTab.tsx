import React, { useState, useEffect } from 'react';
import { Calendar, MessageSquare, Eye, Search, Video, Image, Trash2 } from 'lucide-react';
import { getDocs, collection, query, where, limit, writeBatch, serverTimestamp, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import toast from 'react-hot-toast';
import EventCardNew from '../components/events/EventCardNew';
import ContactMessagesAdmin from '../components/admin/ContactMessagesAdmin';

interface Event {
  id: string;
  title: string;
  description?: string;
  startAt: any;
  endAt?: any;
  duration?: number;
  visibility?: 'public' | 'members' | 'private';
  createdBy?: string;
  invitedUserIds?: string[];
  tags?: string[];
  allDay?: boolean;
  location?: string;
  venueName?: string;
  venueAddress?: string;
  imageUrl?: string;
  isTeaser?: boolean;
  maxAttendees?: number;
  attendingCount?: number;
  qrCode?: string;
  qrCodeGeneratedAt?: any;
  attendanceEnabled?: boolean;
  attendanceCount?: number;
  lastAttendanceUpdate?: any;
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
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFixingStuckProcessing, setIsFixingStuckProcessing] = useState(false);
  const [activeAdminSection, setActiveAdminSection] = useState<'events' | 'messages' | 'users' | 'media' | 'maintenance'>('events');
  
  // Media management state
  const [allMedia, setAllMedia] = useState<any[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [mediaPage, setMediaPage] = useState(0);
  const MEDIA_PAGE_SIZE = 10;

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
      toast.success('User blocked from RSVPing');
      setSearchResults(prev => prev.map(user => 
        user.id === userId ? { ...user, blockedFromRsvp: true } : user
      ));
    } catch (error) {
      console.error('Failed to block user:', error);
      toast.error('Failed to block user');
    }
  };

  // Unblock a user
  const handleUnblockUser = async (userId: string) => {
    try {
      await unblockUser(userId);
      toast.success('User unblocked');
      setSearchResults(prev => prev.map(user => 
        user.id === userId ? { ...user, blockedFromRsvp: false } : user
      ));
    } catch (error) {
      console.error('Failed to unblock user:', error);
      toast.error('Failed to unblock user');
    }
  };

  // Load all media files
  const loadAllMedia = async () => {
    setLoadingMedia(true);
    try {
      const mediaRef = collection(db, 'media');
      const q = query(mediaRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      const media = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      }));
      
      setAllMedia(media);
    } catch (error) {
      console.error('Failed to load media:', error);
      toast.error('Failed to load media files');
    } finally {
      setLoadingMedia(false);
    }
  };

  // Delete media file
  const handleDeleteMedia = async (mediaId: string, mediaData: any) => {
    if (!confirm('Are you sure you want to delete this media file? This cannot be undone.')) return;
    
    try {
      console.log('🗑️ [ADMIN] Starting deletion for media:', {
        mediaId,
        filePath: mediaData.filePath,
        thumbnailPath: mediaData.thumbnailPath,
        type: mediaData.type
      });

      // Only delete from Firestore - Cloud Function will handle storage cleanup
      await deleteDoc(doc(db, 'media', mediaId));
      console.log('🗑️ [ADMIN] Firestore document deleted - Cloud Function will handle storage cleanup');
      
      // Update local state
      setAllMedia(prev => prev.filter(m => m.id !== mediaId));
      toast.success('Media file deleted successfully');
    } catch (error) {
      console.error('Failed to delete media:', error);
      toast.error('Failed to delete media file');
    }
  };

  // Fix stuck processing videos
  const handleFixStuckProcessing = async () => {
    setIsFixingStuckProcessing(true);
    try {
      // Get all media documents that are stuck in processing
      const mediaRef = collection(db, 'media');
      const q = query(mediaRef, where('transcodeStatus', '==', 'processing'));
      const snapshot = await getDocs(q);
      
      const batch = writeBatch(db);
      let fixedCount = 0;
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate();
        const now = new Date();
        const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        
        // If it's been more than 2 hours, mark as completed
        if (hoursDiff > 2) {
          batch.update(doc.ref, { 
            transcodeStatus: 'completed',
            updatedAt: serverTimestamp()
          });
          fixedCount++;
        }
      });
      
      if (fixedCount > 0) {
        await batch.commit();
        toast.success(`Fixed ${fixedCount} stuck processing videos`);
        // Reload media to show updated status
        loadAllMedia();
      } else {
        toast.success('No stuck processing videos found');
      }
    } catch (error) {
      console.error('Failed to fix stuck processing:', error);
      toast.error('Failed to fix stuck processing videos');
    } finally {
      setIsFixingStuckProcessing(false);
    }
  };

  // Load media when media section is active
  useEffect(() => {
    if (activeAdminSection === 'media') {
      loadAllMedia();
    }
  }, [activeAdminSection]);

  // Debug logging moved to useEffect to prevent setState during render
  useEffect(() => {
    console.log('🔍 ProfileAdminTab: Current state', {
      allEvents: allEvents.length,
      loadingAdminEvents,
      eventsPage,
      PAGE_SIZE,
      activeAdminSection,
      eventsData: allEvents.map(e => ({ id: e.id, title: e.title, createdBy: e.createdBy }))
    });
  }, [allEvents, loadingAdminEvents, eventsPage, activeAdminSection]);

  return (
    <div className="grid gap-6">
      {/* Admin Section Navigation */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setActiveAdminSection('events')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'events'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Calendar className="w-4 h-4 inline mr-2" />
          Event Management
        </button>
        <button
          onClick={() => setActiveAdminSection('messages')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'messages'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <MessageSquare className="w-4 h-4 inline mr-2" />
          Contact Messages
        </button>
        <button
          onClick={() => setActiveAdminSection('users')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'users'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Eye className="w-4 h-4 inline mr-2" />
          User Management
        </button>
        <button
          onClick={() => setActiveAdminSection('media')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'media'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Video className="w-4 h-4 inline mr-2" />
          Media Management
        </button>
        <button
          onClick={() => setActiveAdminSection('maintenance')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeAdminSection === 'maintenance'
              ? 'bg-[#F25129] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Search className="w-4 h-4 inline mr-2" />
          System Tools
        </button>
      </div>

      {/* Event Management Section */}
      {activeAdminSection === 'events' && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-gray-700">Admin Event Management</h2>
            <span className="text-xs text-gray-500">({allEvents.length} events)</span>
            <button
              onClick={() => {
                setEventToEdit(null);
                setIsCreateModalOpen(true);
              }}
              className="px-4 py-2 bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white rounded-full hover:from-[#E0451F] hover:to-[#E55A2B]"
              aria-label="Create new event"
            >
              Create New Event
            </button>
            <button
              onClick={() => window.open('/admin/bulk-attendees', '_blank')}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-full hover:from-blue-700 hover:to-blue-800"
              aria-label="Bulk add attendees"
            >
              Bulk Add Attendees
            </button>
          </div>
          {loadingAdminEvents ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
                <div className="animate-spin w-8 h-8 border-4 border-[#F25129] border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-gray-500">Loading admin events...</p>
            </div>
          ) : allEvents.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No events found</p>
            </div>
          ) : (
            <div className="space-y-6">
              {allEvents.slice(eventsPage * PAGE_SIZE, (eventsPage + 1) * PAGE_SIZE).map((event, index) => {
                // Removed console.log from render to prevent setState during render
                return (
                  <div 
                    key={event.id} 
                    className={`space-y-4 p-4 rounded-lg ${
                      index % 2 === 0 
                        ? 'bg-orange-50/50 border-l-4 border-orange-200' 
                        : 'bg-[#FFC107]/10 border-l-4 border-[#FFC107]/30'
                    }`}
                  >
                    <EventCardNew
                      event={event}
                      onEdit={() => {
                        setEventToEdit(event);
                        setIsCreateModalOpen(true);
                      }}
                    />
                  
                  <div className="border-t border-gray-200 pt-4">
                    <div className="text-sm text-gray-600 space-y-1">
                      <p><strong>Event ID:</strong> {event.id}</p>
                      <p><strong>Created by:</strong> {userNames[event.createdBy || ''] || 'Unknown User'}</p>
                      <p><strong>Attendees:</strong> {event.attendingCount || 0} / {event.maxAttendees || 'No limit'}</p>
                      {event.maxAttendees && (
                        <p><strong>Status:</strong> 
                          {(event.attendingCount || 0) >= event.maxAttendees ? 
                            <span className="text-red-600 font-medium"> Full</span> : 
                            <span className="text-green-600"> Available ({event.maxAttendees - (event.attendingCount || 0)} spots left)</span>
                          }
                          {/* Waitlist indicator - will show actual count when integrated */}
                          {(event.attendingCount || 0) >= event.maxAttendees && (
                            <span className="text-purple-600"> • Waitlist enabled</span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => shareEvent(event)}
                        className="px-3 py-1 bg-[#F25129] text-white rounded hover:bg-[#E0451F] text-sm"
                      >
                        Share Event
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}
              
              {/* Event Pagination */}
              {allEvents.length > PAGE_SIZE && (
                <div className="flex justify-center gap-2 mt-6">
                  <button
                    onClick={() => setEventsPage(Math.max(0, eventsPage - 1))}
                    disabled={eventsPage === 0}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="px-4 py-2 text-gray-600">
                    Page {eventsPage + 1} of {Math.ceil(allEvents.length / PAGE_SIZE)}
                  </span>
                  <button
                    onClick={() => setEventsPage(Math.min(Math.ceil(allEvents.length / PAGE_SIZE) - 1, eventsPage + 1))}
                    disabled={eventsPage >= Math.ceil(allEvents.length / PAGE_SIZE) - 1}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}

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
        </>
      )}

      {/* Contact Messages Section */}
      {activeAdminSection === 'messages' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Contact Messages</h2>
            <div className="text-sm text-gray-500">
              <span className="inline-flex items-center px-2 py-1 rounded-full bg-orange-100 text-orange-800">
                📧 Email notifications sent automatically
              </span>
            </div>
          </div>
          <ContactMessagesAdmin />
        </div>
      )}

      {/* User Management Section */}
      {activeAdminSection === 'users' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">User Management</h2>
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search users by name or email..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
              />
              <button
                onClick={handleSearchUsers}
                disabled={isSearching}
                className="px-4 py-2 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] disabled:opacity-50"
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-medium text-gray-900">Search Results:</h3>
                {searchResults.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{user.displayName}</p>
                      <p className="text-sm text-gray-600">{user.email}</p>
                    </div>
                    <div className="flex gap-2">
                      {user.blockedFromRsvp ? (
                        <button
                          onClick={() => handleUnblockUser(user.id)}
                          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                        >
                          Unblock
                        </button>
                      ) : (
                        <button
                          onClick={() => handleBlockUser(user.id)}
                          className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                        >
                          Block
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {loadingBlockedUsers ? (
              <div className="text-center py-4">
                <div className="animate-spin w-6 h-6 border-2 border-[#F25129] border-t-transparent rounded-full mx-auto mb-2"></div>
                <p className="text-gray-500 text-sm">Loading blocked users...</p>
              </div>
            ) : blockedUsers.length > 0 ? (
              <div className="space-y-2">
                <h3 className="font-medium text-gray-900">Blocked Users:</h3>
                {blockedUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div>
                      <p className="font-medium">{user.displayName}</p>
                      <p className="text-sm text-gray-600">{user.email}</p>
                      <p className="text-xs text-gray-500">
                        Blocked: {user.blockedAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
                      </p>
                    </div>
                    <button
                      onClick={() => unblockUser(user.id)}
                      className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <p className="text-sm">No blocked users found</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Media Management Section */}
      {activeAdminSection === 'media' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Media Management</h2>
          
          {loadingMedia ? (
            <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-[#F25129] border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-gray-500">Loading media files...</p>
            </div>
          ) : allMedia.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Video className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No media files found</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {allMedia.slice(mediaPage * MEDIA_PAGE_SIZE, (mediaPage + 1) * MEDIA_PAGE_SIZE).map((media) => (
                  <div key={media.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {media.type === 'video' ? (
                          <Video className="w-5 h-5 text-[#F25129]" />
                        ) : (
                          <Image className="w-5 h-5 text-green-500" />
                        )}
                        <span className="text-sm font-medium capitalize">{media.type}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteMedia(media.id, media)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                        title="Delete media"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    
                    {media.thumbnailUrl && (
                      <img 
                        src={media.thumbnailUrl} 
                        alt="Media thumbnail" 
                        className="w-full h-32 object-cover rounded mb-2"
                      />
                    )}
                    
                    <div className="space-y-1 text-sm text-gray-600">
                      <p><strong>Status:</strong> 
                        <span className={`ml-1 px-2 py-1 rounded text-xs ${
                          media.transcodeStatus === 'completed' ? 'bg-green-100 text-green-800' :
                          media.transcodeStatus === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                          media.transcodeStatus === 'failed' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {media.transcodeStatus || 'pending'}
                        </span>
                      </p>
                      <p><strong>Uploaded by:</strong> {userNames[media.uploadedBy] || 'Unknown'}</p>
                      <p><strong>Created:</strong> {media.createdAt?.toLocaleDateString() || 'Unknown'}</p>
                      {media.fileSize && (
                        <p><strong>Size:</strong> {(media.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Pagination */}
              {allMedia.length > MEDIA_PAGE_SIZE && (
                <div className="flex justify-center gap-2 mt-6">
                  <button
                    onClick={() => setMediaPage(Math.max(0, mediaPage - 1))}
                    disabled={mediaPage === 0}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="px-4 py-2 text-gray-600">
                    Page {mediaPage + 1} of {Math.ceil(allMedia.length / MEDIA_PAGE_SIZE)}
                  </span>
                  <button
                    onClick={() => setMediaPage(Math.min(Math.ceil(allMedia.length / MEDIA_PAGE_SIZE) - 1, mediaPage + 1))}
                    disabled={mediaPage >= Math.ceil(allMedia.length / MEDIA_PAGE_SIZE) - 1}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* System Maintenance Section */}
      {activeAdminSection === 'maintenance' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">System Maintenance</h2>
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
      )}
    </div>
  );
};