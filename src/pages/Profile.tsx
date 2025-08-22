import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, updateDoc, setDoc, deleteDoc, collection, query, where, orderBy, limit, onSnapshot, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import toast from 'react-hot-toast';
import { NJ_CITIES } from '../data/nj-cities';
import { ProfilePersonalTab } from './ProfilePersonalTab';
import { ProfileEventsTab } from './ProfileEventsTab';
import { ProfileRSVPAdminTab } from './ProfileRSVPAdminTab';
import { ProfileAdminTab } from './ProfileAdminTab';
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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [rsvpedEvents, setRsvpedEvents] = useState<Event[]>([]);
  const [userEvents, setUserEvents] = useState<Event[]>([]);
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [rsvpsByEvent, setRsvpsByEvent] = useState<{ [eventId: string]: any[] }>({});
  const [userNames, setUserNames] = useState<{ [userId: string]: string }>({});
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<Event | null>(null);
  const [exportingRsvps, setExportingRsvps] = useState<string | null>(null);
  const [notificationsPage, setNotificationsPage] = useState(1);
  const [eventsPage, setEventsPage] = useState(1);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingAdminEvents, setLoadingAdminEvents] = useState(false);
  const [loadingBlockedUsers, setLoadingBlockedUsers] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread'>('all');
  const [rsvpFilter, setRsvpFilter] = useState<'all' | 'going' | 'maybe' | 'not-going'>('all');
  const [blockedUsers, setBlockedUsers] = useState<{ id: string; displayName: string; email: string; blockedAt: any }[]>([]);
  const PAGE_SIZE = 10;

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
      } catch (e) {
        console.error('Failed to load user profile:', e);
        toast.error('Failed to load profile');
      }
    })();
  }, [currentUser]);

  // Load notifications
  useEffect(() => {
    if (!currentUser) return;
    setLoadingNotifications(true);
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUser.id),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE * notificationsPage)
    );
    const controller = new AbortController();
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!controller.signal.aborted) {
        setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoadingNotifications(false);
      }
    }, (e) => {
      console.error('Failed to load notifications:', e);
      setLoadingNotifications(false);
      toast.error(e?.code === 'permission-denied' ? 'Notifications access denied' : 'Failed to load notifications');
    });
    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [currentUser, notificationsPage]);

  // Load RSVPed events
  useEffect(() => {
    if (!currentUser) return;
    setLoadingEvents(true);
    const q = query(
      collection(db, 'events'),
      where('rsvps', 'array-contains', { userId: currentUser.id, status: 'going' }),
      limit(PAGE_SIZE * eventsPage)
    );
    const controller = new AbortController();
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!controller.signal.aborted) {
        const events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setRsvpedEvents(events);
        fetchUserNames(events.map(e => ({ id: e.createdBy })));
        setLoadingEvents(false);
      }
    }, (e) => {
      console.error('Failed to load RSVPed events:', e);
      setLoadingEvents(false);
      toast.error(e?.code === 'permission-denied' ? 'Events access denied' : 'Failed to load RSVPed events');
    });
    return () => {
      controller.abort();
      unsubscribe();
    };
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
      toast.error(e?.code === 'permission-denied' ? 'User events access denied' : 'Failed to load user events');
    });
    // All events for admins
    let unsubAll: (() => void) | undefined;
    if (currentUser.role === 'admin') {
      setLoadingAdminEvents(true);
      const allQ = query(collection(db, 'events'), orderBy('startAt', 'desc'), limit(PAGE_SIZE * eventsPage));
      unsubAll = onSnapshot(allQ, async (snap) => {
        try {
          const events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setAllEvents(events);
          const batchSize = 10;
          const batches = [];
          for (let i = 0; i < events.length; i += batchSize) {
            batches.push(events.slice(i, i + batchSize));
          }
          const rsvps: { [eventId: string]: any[] } = {};
          for (const batch of batches) {
            await Promise.all(
              batch.map(async (event) => {
                const rsvpQuery = query(collection(db, 'events', event.id, 'rsvps'), orderBy('updatedAt', 'desc'));
                const rsvpSnap = await getDocs(rsvpQuery);
                rsvps[event.id] = rsvpSnap.docs.map(d => ({ id: d.id, eventId: event.id, ...d.data() }));
              })
            );
          }
          setRsvpsByEvent(rsvps);
          fetchUserNames([...events.map(e => ({ id: e.createdBy })), ...Object.values(rsvps).flat()]);
        } catch (e) {
          console.error('Failed to load admin events:', e);
          toast.error('Failed to load events');
        } finally {
          setLoadingAdminEvents(false);
        }
      }, (e) => {
        console.error('Failed to load admin events:', e);
        toast.error(e?.code === 'permission-denied' ? 'Admin events access denied' : 'Failed to load events');
        setLoadingAdminEvents(false);
      });
    }
    return () => {
      unsubUser();
      unsubAll?.();
    };
  }, [currentUser, eventsPage]);

  // Load blocked users for admins
  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchBlockedUsers();
    }
  }, [currentUser?.role]);

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
      console.error('Failed to upload avatar:', e);
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
      console.error('Failed to save profile:', e);
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

  // Block user from RSVPing
  const blockUserFromRsvp = async (userId: string) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists() && userDoc.data().blockedFromRsvp) {
        toast.error('User is already blocked from RSVPing');
        return;
      }
      await updateDoc(doc(db, 'users', userId), {
        blockedFromRsvp: true,
        updatedAt: serverTimestamp(),
      });
      toast.success(`User ${userNames[userId] || userId} blocked from RSVPing`);
      // Refresh blocked users list
      fetchBlockedUsers();
    } catch (e: any) {
      console.error('Failed to block user:', e);
      toast.error(e?.message || 'Failed to block user');
    }
  };

  // Unblock user from RSVPing
  const unblockUser = async (userId: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        blockedFromRsvp: false,
        updatedAt: serverTimestamp()
      });
      toast.success('User unblocked from RSVPing');
      // Refresh blocked users list
      fetchBlockedUsers();
    } catch (e: any) {
      console.error('Failed to unblock user:', e);
      toast.error(e?.message || 'Failed to unblock user');
    }
  };

  // Fetch blocked users
  const fetchBlockedUsers = async () => {
    if (currentUser?.role !== 'admin') return;
    
    setLoadingBlockedUsers(true);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('blockedFromRsvp', '==', true));
      const snapshot = await getDocs(q);
      
      const blocked = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).filter(user => user.blockedFromRsvp === true);
      
      setBlockedUsers(blocked);
    } catch (e: any) {
      console.error('Failed to fetch blocked users:', e);
      toast.error('Failed to fetch blocked users');
    } finally {
      setLoadingBlockedUsers(false);
    }
  };

  // Export RSVPs
  const exportRsvps = async (event: Event) => {
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
    const userIdsToFetch = [...new Set(items
      .map(item => item.id)
      .filter(userId => !userNames[userId] && userId))];
    if (userIdsToFetch.length === 0) return;
    try {
      const userDocs = await Promise.all(
        userIdsToFetch.map(userId =>
          getDoc(doc(db, 'users', userId)).then(snap => ({
            userId,
            displayName: snap.exists()
              ? snap.data().displayName || [snap.data().firstName, snap.data().lastName].filter(Boolean).join(' ') || 'Unknown User'
              : 'Unknown User',
          }))
        )
      );
      userDocs.forEach(({ userId, displayName }) => {
        newUserNames[userId] = displayName;
      });
      setUserNames(prev => ({ ...prev, ...newUserNames }));
    } catch (e) {
      console.error('Error fetching user names:', e);
      toast.error('Failed to fetch user names');
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
  const shareEvent = async (event: Event) => {
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
          <ProfilePersonalTab
            firstName={firstName}
            setFirstName={setFirstName}
            lastName={lastName}
            setLastName={setLastName}
            displayName={displayName}
            setDisplayName={setDisplayName}
            email={email}
            setEmail={setEmail}
            photoURL={photoURL}
            about={about}
            setAbout={setAbout}
            address={address}
            setAddress={setAddress}
            zipStatus={zipStatus}
            interests={interests}
            tagInput={tagInput}
            setTagInput={setTagInput}
            social={social}
            setSocial={setSocial}
            saving={saving}
            uploading={uploading}
            cityOptions={cityOptions}
            onUploadAvatar={onUploadAvatar}
            lookupZip={lookupZip}
            addTag={addTag}
            removeTag={removeTag}
            onTagKeyDown={onTagKeyDown}
            onSave={onSave}
            initialsForAvatar={initialsForAvatar}
          />
        )}
        {activeTab === 'events' && (
          <ProfileEventsTab
            notifications={notifications}
            markNotificationAsRead={markNotificationAsRead}
            markAllNotificationsAsRead={markAllNotificationsAsRead}
            rsvpedEvents={rsvpedEvents}
            userEvents={userEvents}
            allEvents={allEvents}
            userNames={userNames}
            shareEvent={shareEvent}
            setIsCreateModalOpen={setIsCreateModalOpen}
            setEventToEdit={setEventToEdit}
            notificationsPage={notificationsPage}
            setNotificationsPage={setNotificationsPage}
            eventsPage={eventsPage}
            setEventsPage={setEventsPage}
            PAGE_SIZE={PAGE_SIZE}
            notificationFilter={notificationFilter}
            setNotificationFilter={setNotificationFilter}
            loadingNotifications={loadingNotifications}
            loadingEvents={loadingEvents}
            currentUser={currentUser}
          />
        )}
        {activeTab === 'rsvp' && (
          <ProfileRSVPAdminTab
            rsvpsByEvent={rsvpsByEvent}
            allEvents={allEvents}
            userNames={userNames}
            updateRsvp={updateRsvp}
            exportRsvps={exportRsvps}
            exportingRsvps={exportingRsvps}
            adjustAttendingCount={adjustAttendingCount}
            blockUserFromRsvp={blockUserFromRsvp}
            analyzeLastMinuteChanges={analyzeLastMinuteChanges}
            rsvpFilter={rsvpFilter}
            setRsvpFilter={setRsvpFilter}
            eventsPage={eventsPage}
            setEventsPage={setEventsPage}
            PAGE_SIZE={PAGE_SIZE}
            loadingAdminEvents={loadingAdminEvents}
            currentUser={currentUser}
          />
        )}
        {activeTab === 'admin' && currentUser?.role === 'admin' && (
          <ProfileAdminTab
            allEvents={allEvents}
            userNames={userNames}
            setEventToEdit={setEventToEdit}
            setIsCreateModalOpen={setIsCreateModalOpen}
            shareEvent={shareEvent}
            blockUserFromRsvp={blockUserFromRsvp}
            unblockUser={unblockUser}
            eventsPage={eventsPage}
            setEventsPage={setEventsPage}
            PAGE_SIZE={PAGE_SIZE}
            loadingAdminEvents={loadingAdminEvents}
            blockedUsers={blockedUsers}
            loadingBlockedUsers={loadingBlockedUsers}
          />
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