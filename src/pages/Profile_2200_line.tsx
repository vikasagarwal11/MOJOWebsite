import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, updateDoc, setDoc, deleteDoc, collection, query, where, orderBy, limit, onSnapshot, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { Camera, X as IconX, Bell, Eye, Calendar, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { NJ_CITIES } from '../data/nj-cities';
import EventCard from '../components/events/EventCard';
import CreateEventModal from '../components/events/CreateEventModal';

type Address = {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

type SocialLinks = {
  instagram?: string;
  facebook?: string;
  twitter?: string;
  tiktok?: string;
  youtube?: string;
  website?: string;
};

function normalizeTag(input: string): string | null {
  let t = (input || '').trim();
  if (!t) return null;
  if (!t.startsWith('#')) t = `#${t}`;
  t = t.toLowerCase().replace(/\s+/g, '-').replace(/[^#a-z0-9_-]/g, '');
  return t.length > 1 ? t : null;
}

const Profile: React.FC = () => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'personal' | 'events' | 'rsvp' | 'admin'>('personal');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [photoURL, setPhotoURL] = useState<string | undefined>(undefined);
  const [about, setAbout] = useState('');
  const [address, setAddress] = useState<Address>({ state: '' });
  const [zipStatus, setZipStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const zipAbortRef = useRef<AbortController | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [social, setSocial] = useState<SocialLinks>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [rsvpedEvents, setRsvpedEvents] = useState<any[]>([]);
  const [userEvents, setUserEvents] = useState<any[]>([]);
  const [allEvents, setAllEvents] = useState<any[]>([]);
  const [rsvpsByEvent, setRsvpsByEvent] = useState<{ [eventId: string]: any[] }>({});
  const [userNames, setUserNames] = useState<{ [userId: string]: string }>({});
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<any | null>(null);
  const [exportingRsvps, setExportingRsvps] = useState<string | null>(null);
  const [notificationsPage, setNotificationsPage] = useState(1);
  const [eventsPage, setEventsPage] = useState(1);
  const [rsvpFilter, setRsvpFilter] = useState<'all' | 'going' | 'maybe' | 'not-going'>('all');
  const PAGE_SIZE = 10;
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread'>('all');

  // Load user profile
  useEffect(() => {
    if (!currentUser) return;
    setDisplayName(currentUser.displayName || '');
    setEmail(currentUser.email || '');
    setPhotoURL(currentUser.photoURL);
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', currentUser.id));
        if (snap.exists()) {
          const d = snap.data() as any;
          setFirstName(d.firstName || '');
          setLastName(d.lastName || '');
          setDisplayName(d.displayName || currentUser.displayName || '');
          setEmail(d.email || currentUser.email || '');
          setPhotoURL(d.photoURL || currentUser.photoURL);
          setAbout(d.about || '');
          setAddress({
            street: d.address?.street || '',
            city: d.address?.city || '',
            state: d.address?.state || '',
            postalCode: d.address?.postalCode || '',
          });
          setInterests(Array.isArray(d.interests) ? d.interests : []);
          setSocial({
            instagram: d.social?.instagram || '',
            facebook: d.social?.facebook || '',
            twitter: d.social?.twitter || '',
            tiktok: d.social?.tiktok || '',
            youtube: d.social?.youtube || '',
            website: d.social?.website || '',
          });
        }
      } catch {
        // Ignore snapshot errors
      }
    })();
  }, [currentUser]);

  // Load notifications
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUser.id),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE * notificationsPage)
    );
    return onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => {
      console.error('Failed to load notifications:', e);
      toast.error('Failed to load notifications');
    });
  }, [currentUser, notificationsPage]);

  // Load RSVPed events
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'events'), where('rsvps', 'array-contains', { userId: currentUser.id, status: 'going' }), limit(PAGE_SIZE * eventsPage));
    return onSnapshot(q, (snap) => {
      setRsvpedEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => {
      console.error('Failed to load RSVPed events:', e);
      toast.error('Failed to load RSVPed events');
    });
  }, [currentUser, eventsPage]);

  // Load user-created and all events (for admins)
  useEffect(() => {
    if (!currentUser) return;
    // User-created events
    const userQ = query(
      collection(db, 'events'),
      where('createdBy', '==', currentUser.id),
      orderBy('startAt', 'desc'),
      limit(PAGE_SIZE * eventsPage)
    );
    const unsubUser = onSnapshot(userQ, (snap) => {
      const events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setUserEvents(events);
      fetchUserNames(events.map(e => ({ id: e.createdBy })));
    }, (e) => {
      console.error('Failed to load user events:', e);
      toast.error('Failed to load user events');
    });

    // All events for admins
    if (currentUser.role === 'admin') {
      const allQ = query(collection(db, 'events'), orderBy('startAt', 'desc'), limit(PAGE_SIZE * eventsPage));
      const unsubAll = onSnapshot(allQ, async (snap) => {
        const events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllEvents(events);
        const rsvps: { [eventId: string]: any[] } = {};
        for (const event of events) {
          const rsvpQuery = query(collection(db, 'events', event.id, 'rsvps'));
          const rsvpSnap = await getDocs(rsvpQuery);
          rsvps[event.id] = rsvpSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        setRsvpsByEvent(rsvps);
        fetchUserNames([...events.map(e => ({ id: e.createdBy })), ...Object.values(rsvps).flat()]);
      }, (e) => {
        console.error('Failed to load admin events:', e);
        toast.error('Failed to load events');
      });
      return () => { unsubUser(); unsubAll(); };
    }
    return unsubUser;
  }, [currentUser, eventsPage]);

  const isAuthed = !!currentUser;
  const initialsForAvatar = useMemo(() => {
    const name = displayName || [firstName, lastName].filter(Boolean).join(' ') || 'Member';
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map(p => p[0]?.toUpperCase() || '').join('') || 'MM';
  }, [displayName, firstName, lastName]);

  // Avatar upload
  const onUploadAvatar = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (JPEG/PNG/WebP).');
      return;
    }
    const tempUrl = URL.createObjectURL(file);
    setPhotoURL(tempUrl);
    try {
      setUploading(true);
      const ext =
        file.type === 'image/png' ? 'png' :
        file.type === 'image/webp' ? 'webp' :
        file.type === 'image/gif' ? 'gif' : 'jpg';
      const ts = Date.now();
      const avatarRef = ref(storage, `profiles/${currentUser!.id}/avatar_${ts}.${ext}`);
      await uploadBytes(avatarRef, file, {
        contentType: file.type,
        cacheControl: 'public, max-age=3600',
      });
      const url = await getDownloadURL(avatarRef);
      URL.revokeObjectURL(tempUrl);
      setPhotoURL(url);
      await updateDoc(doc(db, 'users', currentUser!.id), {
        photoURL: url,
        avatarUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success('Profile photo updated');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  // ZIP lookup
  const lookupZip = async (zip: string) => {
    if (!/^\d{5}$/.test(zip)) return;
    zipAbortRef.current?.abort();
    const ctrl = new AbortController();
    zipAbortRef.current = ctrl;
    setZipStatus('loading');
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${zip}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error('not found');
      const data = await res.json();
      const place = data?.places?.[0];
      const city = place?.['place name'] || '';
      const state = place?.['state abbreviation'] || '';
      if (city && state) {
        setAddress(a => ({ ...a, city, state }));
        setZipStatus('ok');
      } else {
        setZipStatus('error');
      }
    } catch {
      setZipStatus('error');
    }
  };

  // Interests
  const addTag = (raw: string) => {
    const t = normalizeTag(raw);
    if (!t) return;
    if (interests.includes(t)) return;
    setInterests(prev => [...prev, t]);
  };

  const removeTag = (t: string) => setInterests(prev => prev.filter(x => x !== t));

  const onTagKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
      setTagInput('');
    }
  };

  // Save profile
  const onSave = async () => {
    const hasAnyAddress =
      !!address.street || !!address.city || !!address.state || !!address.postalCode;
    if (hasAnyAddress && (!address.city || !address.state)) {
      toast.error('If you add an address, City and State are required.');
      return;
    }
    const computedDisplay = [firstName, lastName].filter(Boolean).join(' ') || displayName || 'Member';
    try {
      setSaving(true);
      await updateDoc(doc(db, 'users', currentUser!.id), {
        firstName: firstName || '',
        lastName: lastName || '',
        displayName: computedDisplay,
        email: email || '',
        address: hasAnyAddress
          ? {
              street: address.street || '',
              city: address.city || '',
              state: address.state || 'NJ',
              postalCode: address.postalCode || '',
            }
          : {},
        social,
        interests,
        about: (about || '').trim(),
        updatedAt: serverTimestamp(),
      });
      setDisplayName(computedDisplay);
      toast.success('Profile saved');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  // Mark notification as read
  const markNotificationAsRead = async (notificationId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true,
        updatedAt: serverTimestamp(),
      });
      toast.success('Notification marked as read');
    } catch (e: any) {
      console.error('Failed to mark notification as read:', e);
      toast.error(e?.message || 'Failed to mark notification as read');
    }
  };

  // Mark all notifications as read
  const markAllNotificationsAsRead = async () => {
    try {
      const batch = writeBatch(db);
      notifications.forEach(n => {
        if (!n.read) {
          batch.update(doc(db, 'notifications', n.id), { read: true, updatedAt: serverTimestamp() });
        }
      });
      await batch.commit();
      toast.success('All notifications marked as read');
    } catch (e: any) {
      console.error('Failed to mark all notifications as read:', e);
      toast.error(e?.message || 'Failed to mark all notifications as read');
    }
  };

  // Update RSVP
  const updateRsvp = async (eventId: string, userId: string, status: 'going' | 'maybe' | 'not-going' | null) => {
    try {
      const rsvpRef = doc(db, 'events', eventId, 'rsvps', userId);
      const snap = await getDoc(rsvpRef);
      const existing = snap.exists() ? snap.data() : { statusHistory: [] };
      const newHistory = [
        ...(existing.statusHistory || []),
        {
          status,
          changedAt: serverTimestamp(),
          changedBy: currentUser!.id,
        }
      ];
      if (status === null) {
        await deleteDoc(rsvpRef);
      } else {
        await setDoc(rsvpRef, {
          status,
          createdAt: existing.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
          statusHistory: newHistory,
        }, { merge: true });
      }
      toast.success('RSVP updated');
    } catch (e: any) {
      console.error('Failed to update RSVP:', e);
      toast.error(e?.message || 'Failed to update RSVP');
    }
  };

  // Export RSVPs
  const exportRsvps = async (event: any) => {
    if (exportingRsvps === event.id) return;
    try {
      setExportingRsvps(event.id);
      const rsvps = rsvpsByEvent[event.id] || [];
      if (rsvps.length === 0) {
        toast.error('No RSVPs to export');
        return;
      }
      const userDetails = await Promise.all(
        rsvps.map(async (rsvp) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', rsvp.id));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              return {
                userId: rsvp.id,
                status: rsvp.status,
                firstName: userData.firstName || '',
                lastName: userData.lastName || '',
                displayName: userData.displayName || '',
                email: userData.email || '',
                phone: userData.phone || '',
                address: userData.address ? `${userData.address.street || ''} ${userData.address.city || ''} ${userData.address.state || ''} ${userData.address.postalCode || ''}`.trim() : '',
                rsvpDate: rsvp.createdAt?.toDate?.() ? new Date(rsvp.createdAt.toDate()).toLocaleDateString('en-US') : 'Unknown'
              };
            }
            return {
              userId: rsvp.id,
              status: rsvp.status,
              firstName: 'Unknown',
              lastName: 'User',
              displayName: 'Unknown User',
              email: '',
              phone: '',
              address: '',
              rsvpDate: rsvp.createdAt?.toDate?.() ? new Date(rsvp.createdAt.toDate()).toLocaleDateString('en-US') : 'Unknown'
            };
          } catch {
            return {
              userId: rsvp.id,
              status: rsvp.status,
              firstName: 'Error',
              lastName: 'Loading',
              displayName: 'Error Loading User',
              email: '',
              phone: '',
              address: '',
              rsvpDate: rsvp.createdAt?.toDate?.() ? new Date(rsvp.createdAt.toDate()).toLocaleDateString('en-US') : 'Unknown'
            };
          }
        })
      );
      const headers = [
        'User ID',
        'First Name',
        'Last Name',
        'Display Name',
        'Email',
        'Phone',
        'Address',
        'RSVP Status',
        'RSVP Date'
      ];
      const csvRows = [
        headers.join(','),
        ...userDetails.map(user => [
          user.userId,
          `"${user.firstName}"`,
          `"${user.lastName}"`,
          `"${user.displayName}"`,
          `"${user.email}"`,
          `"${user.phone}"`,
          `"${user.address}"`,
          user.status,
          user.rsvpDate
        ].join(','))
      ];
      const csv = csvRows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${event.title.replace(/[^a-z0-9]/gi, '_')}_rsvps_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${userDetails.length} RSVPs with full user details`);
    } catch (e: any) {
      console.error('Error exporting RSVPs:', e);
      toast.error(e?.message || 'Failed to export RSVPs');
    } finally {
      setExportingRsvps(null);
    }
  };

  // Fetch user names
  const fetchUserNames = async (items: any[]) => {
    const newUserNames: { [userId: string]: string } = {};
    const userIdsToFetch = items
      .map(item => item.id)
      .filter(userId => !userNames[userId] && userId);
    if (userIdsToFetch.length === 0) return;
    try {
      const userPromises = userIdsToFetch.map(async (userId) => {
        try {
          const userDoc = await getDoc(doc(db, 'users', userId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const displayName = userData.displayName || [userData.firstName, userData.lastName].filter(Boolean).join(' ') || 'Unknown User';
            return { userId, displayName };
          }
          return { userId, displayName: 'Unknown User' };
        } catch {
          return { userId, displayName: 'Error Loading' };
        }
      });
      const results = await Promise.all(userPromises);
      results.forEach(({ userId, displayName }) => {
        newUserNames[userId] = displayName;
      });
      setUserNames(prev => ({ ...prev, ...newUserNames }));
    } catch (e) {
      console.error('Error fetching user names:', e);
    }
  };

  // Adjust attending count
  const adjustAttendingCount = async (eventId: string, increment: boolean) => {
    try {
      const eventRef = doc(db, 'events', eventId);
      const eventSnap = await getDoc(eventRef);
      const currentCount = eventSnap.data()?.attendingCount || 0;
      await updateDoc(eventRef, { attendingCount: Math.max(0, currentCount + (increment ? 1 : -1)) });
      toast.success('Attendance count updated');
    } catch (e: any) {
      console.error('Failed to update attendance count:', e);
      toast.error(e?.message || 'Failed to update attendance count');
    }
  };

  // Share event
  const shareEvent = async (event: any) => {
    const shareData = { title: event.title, url: `${window.location.origin}/events/${event.id}` };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        toast.success('Event link copied to clipboard');
      }
    } catch (e: any) {
      console.error('Failed to share event:', e);
      toast.error(e?.message || 'Failed to share event');
    }
  };

  // Analyze last-minute changes
  const analyzeLastMinuteChanges = (rsvp: any, eventStart: any) => {
    const history = rsvp.statusHistory || [];
    const eventStartTime = eventStart?.toDate?.() ? new Date(eventStart.toDate()).getTime() : Date.now();
    return history.filter((h: any) => {
      const changeTime = h.changedAt?.toDate?.() ? new Date(h.changedAt.toDate()).getTime() : 0;
      return h.status === 'not-going' && (eventStartTime - changeTime) <= 24 * 60 * 60 * 1000;
    }).length;
  };

  const cityOptions = useMemo(() => NJ_CITIES, []);

  if (!isAuthed) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="rounded-xl border bg-white p-8">
          <h1 className="text-2xl font-semibold">Profile</h1>
          <p className="mt-4 text-gray-600">Please sign in to view your profile.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="rounded-2xl border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold mb-6">My Profile</h1>
        {/* Tabs */}
        <div className="flex space-x-1 mb-8 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('personal')}
            className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${activeTab === 'personal' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-600 hover:text-purple-600'}`}
            aria-selected={activeTab === 'personal'}
          >
            Personal
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${activeTab === 'events' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-600 hover:text-purple-600'}`}
            aria-selected={activeTab === 'events'}
          >
            My Events
          </button>
          <button
            onClick={() => setActiveTab('rsvp')}
            className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${activeTab === 'rsvp' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-600 hover:text-purple-600'}`}
            aria-selected={activeTab === 'rsvp'}
          >
            RSVP Management
          </button>
          {currentUser?.role === 'admin' && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${activeTab === 'admin' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-600 hover:text-purple-600'}`}
              aria-selected={activeTab === 'admin'}
            >
              Admin
            </button>
          )}
        </div>
        {/* Content */}
        {activeTab === 'personal' && (
          <div className="grid gap-6">
            {/* [Personal tab content unchanged] */}
          </div>
        )}
        {activeTab === 'events' && (
          <div className="grid gap-6">
            {/* Notifications */}
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
              </div>
              {notifications.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <Bell className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">No notifications yet</p>
                  <p className="text-sm text-gray-400">You'll see RSVP notifications here when members join your events</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 rounded-lg border transition-all duration-200 ${notification.read ? 'bg-gray-50 border-gray-200 text-gray-600' : 'bg-purple-50 border-purple-200 text-gray-900'}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{notification.message}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {notification.createdAt?.toDate?.() ?
                              new Date(notification.createdAt.toDate()).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              }) : 'Recently'}
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
                  <button
                    onClick={() => setNotificationsPage(p => p + 1)}
                    className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-full hover:bg-purple-700"
                    aria-label="Load more notifications"
                  >
                    Load More Notifications
                  </button>
                </div>
              )}
            </div>
            {/* RSVPed Events */}
            <div className="grid gap-4">
              <h2 className="text-sm font-semibold text-gray-700">My RSVPed Events</h2>
              {rsvpedEvents.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">You haven't RSVPed to any events yet.</p>
                  <p className="text-sm text-gray-400">Find events to join in the Events section!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {rsvpedEvents.map(event => (
                    <div key={event.id} className="relative">
                      <EventCard event={event} />
                      <button
                        onClick={() => shareEvent(event)}
                        className="absolute top-4 right-4 p-2 bg-purple-600 text-white rounded-full hover:bg-purple-700"
                        aria-label={`Share ${event.title}`}
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {rsvpedEvents.length >= PAGE_SIZE * eventsPage && (
                <button
                  onClick={() => setEventsPage(p => p + 1)}
                  className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-full hover:bg-purple-700"
                  aria-label="Load more events"
                >
                  Load More Events
                </button>
              )}
            </div>
            {/* User-Created Events */}
            {userEvents.length > 0 && (
              <div className="grid gap-4">
                <h2 className="text-sm font-semibold text-gray-700">My Created Events</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {userEvents.map(event => (
                    <div key={event.id} className="relative">
                      <EventCard event={{ ...event, createdBy: userNames[event.createdBy] || event.createdBy }} onEdit={() => {
                        setEventToEdit(event);
                        setIsCreateModalOpen(true);
                      }} />
                      <button
                        onClick={() => shareEvent(event)}
                        className="absolute top-4 right-4 p-2 bg-purple-600 text-white rounded-full hover:bg-purple-700"
                        aria-label={`Share ${event.title}`}
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                {userEvents.length >= PAGE_SIZE * eventsPage && (
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
        )}
        {activeTab === 'rsvp' && (
          <div className="grid gap-6">
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
                    • Status changes are logged automatically<br/>
                    • Last-minute cancellations are highlighted<br/>
                    • Full audit trail for compliance
                  </div>
                </div>
              </div>
            </div>
           
            {/* Events with RSVP Management */}
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
                  <div key={event.id} className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg text-gray-900">{event.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span>
                            📅 {event.startAt?.toDate?.() ?
                              new Date(event.startAt.toDate()).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              }) : 'Date TBD'}
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
                          onClick={() => {
                            setEventToEdit(event);
                            setIsCreateModalOpen(true);
                          }}
                          className="text-xs px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                          aria-label={`Edit ${event.title}`}
                        >
                          Edit
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
                              toast.success('Event deleted successfully');
                            } catch (e: any) {
                              toast.error(e?.message || 'Failed to delete event');
                            }
                          }}
                          className="text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                          aria-label={`Delete ${event.title}`}
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => shareEvent(event)}
                          className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                          aria-label={`Share ${event.title}`}
                        >
                          Share
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
                           
                            {/* Quick Name Lists */}
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <div className="text-xs text-gray-600 space-y-1">
                                <div>
                                  <span className="font-medium text-green-700">Going:</span> {
                                    rsvpsByEvent[event.id]
                                      .filter(r => r.status === 'going')
                                      .map(r => userNames[r.id] || 'Loading...')
                                      .join(', ') || 'None'
                                  }
                                </div>
                                <div>
                                  <span className="font-medium text-yellow-700">Maybe:</span> {
                                    rsvpsByEvent[event.id]
                                      .filter(r => r.status === 'maybe')
                                      .map(r => userNames[r.id] || 'Loading...')
                                      .join(', ') || 'None'
                                  }
                                </div>
                              </div>
                            </div>
                          </div>
                         
                          {/* Detailed RSVP List */}
                          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mt-4">
                            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                              <span className="text-sm font-medium text-gray-700">Detailed RSVP List</span>
                            </div>
                            <ul className="divide-y divide-gray-200 max-h-60 overflow-y-auto">
                              {rsvpsByEvent[event.id].map(rsvp => (
                                <li key={rsvp.id} className="px-4 py-3 flex justify-between items-center hover:bg-gray-50">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm text-gray-900">
                                        {userNames[rsvp.id] || 'Loading...'}
                                      </span>
                                      <span className="text-xs text-gray-400">({rsvp.id.slice(0, 8)}...)</span>
                                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                        rsvp.status === 'going' ? 'bg-green-100 text-green-800' :
                                        rsvp.status === 'maybe' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-red-100 text-red-800'
                                      }`}>
                                        {rsvp.status === 'going' ? '✅ Going' :
                                         rsvp.status === 'maybe' ? '🤔 Maybe' : '❌ Not Going'}
                                      </span>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                                      <span>📅 RSVP: {rsvp.createdAt?.toDate?.() ?
                                        new Date(rsvp.createdAt.toDate()).toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        }) : 'Unknown'}</span>
                                      {rsvp.updatedAt && (
                                        <span>🔄 Updated: {new Date(rsvp.updatedAt.toDate()).toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })}</span>
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
              </div>
            )}
          </div>
        )}
        {activeTab === 'admin' && currentUser?.role === 'admin' && (
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
            {allEvents.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">No events found</p>
              </div>
            ) : (
              <div className="space-y-6">
                {allEvents.map(event => (
                  <div key={event.id} className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg text-gray-900">{event.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span>
                            📅 {event.startAt?.toDate?.() ?
                              new Date(event.startAt.toDate()).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              }) : 'Date TBD'}
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
                          onClick={() => {
                            setEventToEdit(event);
                            setIsCreateModalOpen(true);
                          }}
                          className="text-xs px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                          aria-label={`Edit ${event.title}`}
                        >
                          Edit
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
                          className="text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                          aria-label={`Delete ${event.title}`}
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => shareEvent(event)}
                          className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                          aria-label={`Share ${event.title}`}
                        >
                          Share
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
                           
                            {/* Quick Name Lists */}
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <div className="text-xs text-gray-600 space-y-1">
                                <div>
                                  <span className="font-medium text-green-700">Going:</span> {
                                    rsvpsByEvent[event.id]
                                      .filter(r => r.status === 'going')
                                      .map(r => userNames[r.id] || 'Loading...')
                                      .join(', ') || 'None'
                                  }
                                </div>
                                <div>
                                  <span className="font-medium text-yellow-700">Maybe:</span> {
                                    rsvpsByEvent[event.id]
                                      .filter(r => r.status === 'maybe')
                                      .map(r => userNames[r.id] || 'Loading...')
                                      .join(', ') || 'None'
                                  }
                                </div>
                              </div>
                            </div>
                          </div>
                         
                          {/* Detailed RSVP List */}
                          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mt-4">
                            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                              <span className="text-sm font-medium text-gray-700">Detailed RSVP List</span>
                            </div>
                            <ul className="divide-y divide-gray-200 max-h-60 overflow-y-auto">
                              {rsvpsByEvent[event.id].map(rsvp => (
                                <li key={rsvp.id} className="px-4 py-3 flex justify-between items-center hover:bg-gray-50">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm text-gray-900">
                                        {userNames[rsvp.id] || 'Loading...'}
                                      </span>
                                      <span className="text-xs text-gray-400">({rsvp.id.slice(0, 8)}...)</span>
                                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                        rsvp.status === 'going' ? 'bg-green-100 text-green-800' :
                                        rsvp.status === 'maybe' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-red-100 text-red-800'
                                      }`}>
                                        {rsvp.status === 'going' ? '✅ Going' :
                                         rsvp.status === 'maybe' ? '🤔 Maybe' : '❌ Not Going'}
                                      </span>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                                      <span>📅 RSVP: {rsvp.createdAt?.toDate?.() ?
                                        new Date(rsvp.createdAt.toDate()).toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        }) : 'Unknown'}</span>
                                      {rsvp.updatedAt && (
                                        <span>🔄 Updated: {new Date(rsvp.updatedAt.toDate()).toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })}</span>
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
              </div>
            )}
          </div>
        )}
        {activeTab === 'admin' && currentUser?.role === 'admin' && (
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
            {allEvents.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">No events found</p>
              </div>
            ) : (
              <div className="space-y-6">
                {allEvents.map(event => (
                  <div key={event.id} className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg text-gray-900">{event.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span>
                            📅 {event.startAt?.toDate?.() ?
                              new Date(event.startAt.toDate()).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              }) : 'Date TBD'}
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
                          onClick={() => {
                            setEventToEdit(event);
                            setIsCreateModalOpen(true);
                          }}
                          className="text-xs px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                          aria-label={`Edit ${event.title}`}
                        >
                          Edit
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
                          className="text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                          aria-label={`Delete ${event.title}`}
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => shareEvent(event)}
                          className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                          aria-label={`Share ${event.title}`}
                        >
                          Share
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
                           
                            {/* Quick Name Lists */}
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <div className="text-xs text-gray-600 space-y-1">
                                <div>
                                  <span className="font-medium text-green-700">Going:</span> {
                                    rsvpsByEvent[event.id]
                                      .filter(r => r.status === 'going')
                                      .map(r => userNames[r.id] || 'Loading...')
                                      .join(', ') || 'None'
                                  }
                                </div>
                                <div>
                                  <span className="font-medium text-yellow-700">Maybe:</span> {
                                    rsvpsByEvent[event.id]
                                      .filter(r => r.status === 'maybe')
                                      .map(r => userNames[r.id] || 'Loading...')
                                      .join(', ') || 'None'
                                  }
                                </div>
                              </div>
                            </div>
                          </div>
                         
                          {/* Detailed RSVP List */}
                          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mt-4">
                            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                              <span className="text-sm font-medium text-gray-700">Detailed RSVP List</span>
                            </div>
                            <ul className="divide-y divide-gray-200 max-h-60 overflow-y-auto">
                              {rsvpsByEvent[event.id].map(rsvp => (
                                <li key={rsvp.id} className="px-4 py-3 flex justify-between items-center hover:bg-gray-50">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm text-gray-900">
                                        {userNames[rsvp.id] || 'Loading...'}
                                      </span>
                                      <span className="text-xs text-gray-400">({rsvp.id.slice(0, 8)}...)</span>
                                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                        rsvp.status === 'going' ? 'bg-green-100 text-green-800' :
                                        rsvp.status === 'maybe' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-red-100 text-red-800'
                                      }`}>
                                        {rsvp.status === 'going' ? '✅ Going' :
                                         rsvp.status === 'maybe' ? '🤔 Maybe' : '❌ Not Going'}
                                      </span>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                                      <span>📅 RSVP: {rsvp.createdAt?.toDate?.() ?
                                        new Date(rsvp.createdAt.toDate()).toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        }) : 'Unknown'}</span>
                                      {rsvp.updatedAt && (
                                        <span>🔄 Updated: {new Date(rsvp.updatedAt.toDate()).toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })}</span>
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
              </div>
            )}
          </div>
        )}
        {activeTab === 'admin' && currentUser?.role === 'admin' && (
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
            {allEvents.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">No events found</p>
              </div>
            ) : (
              <div className="space-y-6">
                {allEvents.map(event => (
                  <div key={event.id} className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg text-gray-900">{event.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span>
                            📅 {event.startAt?.toDate?.() ?
                              new Date(event.startAt.toDate()).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              }) : 'Date TBD'}
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
                          onClick={() => {
                            setEventToEdit(event);
                            setIsCreateModalOpen(true);
                          }}
                          className="text-xs px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                          aria-label={`Edit ${event.title}`}
                        >
                          Edit
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
                          className="text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                          aria-label={`Delete ${event.title}`}
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => shareEvent(event)}
                          className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                          aria-label={`Share ${event.title}`}
                        >
                          Share
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
                           
                            {/* Quick Name Lists */}
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <div className="text-xs text-gray-600 space-y-1">
                                <div>
                                  <span className="font-medium text-green-700">Going:</span> {
                                    rsvpsByEvent[event.id]
                                      .filter(r => r.status === 'going')
                                      .map(r => userNames[r.id] || 'Loading...')
                                      .join(', ') || 'None'
                                  }
                                </div>
                                <div>
                                  <span className="font-medium text-yellow-700">Maybe:</span> {
                                    rsvpsByEvent[event.id]
                                      .filter(r => r.status === 'maybe')
                                      .map(r => userNames[r.id] || 'Loading...')
                                      .join(', ') || 'None'
                                  }
                                </div>
                              </div>
                            </div>
                          </div>
                         
                          {/* Detailed RSVP List */}
                          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mt-4">
                            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                              <span className="text-sm font-medium text-gray-700">Detailed RSVP List</span>
                            </div>
                            <ul className="divide-y divide-gray-200 max-h-60 overflow-y-auto">
                              {rsvpsByEvent[event.id].map(rsvp => (
                                <li key={rsvp.id} className="px-4 py-3 flex justify-between items-center hover:bg-gray-50">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm text-gray-900">
                                        {userNames[rsvp.id] || 'Loading...'}
                                      </span>
                                      <span className="text-xs text-gray-400">({rsvp.id.slice(0, 8)}...)</span>
                                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                        rsvp.status === 'going' ? 'bg-green-100 text-green-800' :
                                        rsvp.status === 'maybe' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-red-100 text-red-800'
                                      }`}>
                                        {rsvp.status === 'going' ? '✅ Going' :
                                         rsvp.status === 'maybe' ? '🤔 Maybe' : '❌ Not Going'}
                                      </span>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                                      <span>📅 RSVP: {rsvp.createdAt?.toDate?.() ?
                                        new Date(rsvp.createdAt.toDate()).toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        }) : 'Unknown'}</span>
                                      {rsvp.updatedAt && (
                                        <span>🔄 Updated: {new Date(rsvp.updatedAt.toDate()).toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })}</span>
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
              </div>
            )}
          </div>
        )}
        {activeTab === 'admin' && currentUser?.role === 'admin' && (
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
            {allEvents.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">No events found</p>
              </div>
            ) : (
              <div className="space-y-6">
                {allEvents.map(event => (
                  <div key={event.id} className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg text-gray-900">{event.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span>
                            📅 {event.startAt?.toDate?.() ?
                              new Date(event.startAt.toDate()).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              }) : 'Date TBD'}
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
                          onClick={() => {
                            setEventToEdit(event);
                            setIsCreateModalOpen(true);
                          }}
                          className="text-xs px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                          aria-label={`Edit ${event.title}`}
                        >
                          Edit
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
                          className="text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                          aria-label={`Delete ${event.title}`}
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => shareEvent(event)}
                          className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                          aria-label={`Share ${event.title}`}
                        >
                          Share
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
                           
                            {/* Quick Name Lists */}
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <div className="text-xs text-gray-600 space-y-1">
                                <div>
                                  <span className="font-medium text-green-700">Going:</span> {
                                    rsvpsByEvent[event.id]
                                      .filter(r => r.status === 'going')
                                      .map(r => userNames[r.id] || 'Loading...')
                                      .join(', ') || 'None'
                                  }
                                </div>
                                <div>
                                  <span className="font-medium text-yellow-700">Maybe:</span> {
                                    rsvpsByEvent[event.id]
                                      .filter(r => r.status === 'maybe')
                                      .map(r => userNames[r.id] || 'Loading...')
                                      .join(', ') || 'None'
                                  }
                                </div>
                              </div>
                            </div>
                          </div>
                         
                          {/* Detailed RSVP List */}
                          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mt-4">
                            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                              <span className="text-sm font-medium text-gray-700">Detailed RSVP List</span>
                            </div>
                            <ul className="divide-y divide-gray-200 max-h-60 overflow-y-auto">
                              {rsvpsByEvent[event.id].map(rsvp => (
                                <li key={rsvp.id} className="px-4 py-3 flex justify-between items-center hover:bg-gray-50">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm text-gray-900">
                                        {userNames[rsvp.id] || 'Loading...'}
                                      </span>
                                      <span className="text-xs text-gray-400">({rsvp.id.slice(0, 8)}...)</span>
                                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                        rsvp.status === 'going' ? 'bg-green-100 text-green-800' :
                                        rsvp.status === 'maybe' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-red-100 text-red-800'
                                      }`}>
                                        {rsvp.status === 'going' ? '✅ Going' :
                                         rsvp.status === 'maybe' ? '🤔 Maybe' : '❌ Not Going'}
                                      </span>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                                      <span>📅 RSVP: {rsvp.createdAt?.toDate?.() ?
                                        new Date(rsvp.createdAt.toDate()).toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        }) : 'Unknown'}</span>
                                      {rsvp.updatedAt && (
                                        <span>🔄 Updated: {new Date(rsvp.updatedAt.toDate()).toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })}</span>
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
              </div>
            )}
          </div>
        )}
      </div>
      {/* Create/Edit Event Modal */}
      {isCreateModalOpen && (
        <CreateEventModal
          onClose={() => {
            setIsCreateModalOpen(false);
            setEventToEdit(null);
          }}
          onEventCreated={() => {
            setIsCreateModalOpen(false);
            setEventToEdit(null);
          }}
          eventToEdit={eventToEdit}
        />
      )}
    </div>
  );
};

export default Profile;