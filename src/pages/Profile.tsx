import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, updateDoc, setDoc, deleteDoc, collection, query, where, orderBy, limit, onSnapshot, getDocs, serverTimestamp, writeBatch, collectionGroup } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import toast from 'react-hot-toast';
import { NJ_CITIES } from '../data/nj-cities';
import { ProfilePersonalTab } from './ProfilePersonalTab';
import { ProfileEventsTab } from './ProfileEventsTab';
import { ProfileRSVPAdminTab } from './ProfileRSVPAdminTab';
import { ProfileAdminTab } from './ProfileAdminTab';
import { AdminKnowledgeBaseTab } from './AdminKnowledgeBaseTab';
import CreateEventModal from '../components/events/CreateEventModal';
import { useUserBlocking } from '../hooks/useUserBlocking';
import { UserBlockModal } from '../components/user/UserBlockModal';
import { FamilyMemberList } from '../components/family/FamilyMemberList';
import { normalizeEvent } from '../utils/normalizeEvent';
import { sanitizeFirebaseData } from '../utils/dataSanitizer';
import { safeISODate } from '../utils/dateUtils';

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

type ProfileMode = 'profile' | 'admin';
type TabKey = 'personal' | 'events' | 'rsvp' | 'admin' | 'family' | 'knowledge';

interface ProfileProps {
  mode?: ProfileMode;
}

const Profile: React.FC<ProfileProps> = ({ mode = 'profile' }) => {
  const { currentUser, listenersReady } = useAuth();
  const defaultTab: TabKey = mode === 'admin' ? 'rsvp' : 'personal';
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [photoURL, setPhotoURL] = useState<string | undefined>(undefined);
  const [about, setAbout] = useState('');
  const [address, setAddress] = useState<Address>({ state: '' });
  const [zipStatus, setZipStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const zipAbortRef = useRef<AbortController | null>(null);
  const [zipSuggestions, setZipSuggestions] = useState<string[]>([]);
  const [cityStatus, setCityStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const cityAbortRef = useRef<AbortController | null>(null);
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
  const [rsvpFilter, setRsvpFilter] = useState<'all' | 'going' | 'not-going'>('all');
  const [blockedUsers, setBlockedUsers] = useState<{ id: string; displayName: string; email: string; blockedAt: any }[]>([]);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [userToBlock, setUserToBlock] = useState<any>(null);
  const PAGE_SIZE = 10;

  const isAdmin = currentUser?.role === 'admin';

  const tabConfigs = useMemo(
    () => [
      { key: 'personal' as TabKey, label: 'Personal', show: mode === 'profile' },
      {
        key: 'events' as TabKey,
        label: isAdmin ? 'My Events' : "Events I'm Attending",
        show: mode === 'profile',
      },
      { key: 'rsvp' as TabKey, label: 'RSVP Management', show: isAdmin && mode === 'admin' },
      { key: 'family' as TabKey, label: 'Family Management', show: mode === 'profile' },
      { key: 'admin' as TabKey, label: 'Admin Tools', show: isAdmin && mode === 'admin' },
      { key: 'knowledge' as TabKey, label: 'Knowledge Base', show: isAdmin && mode === 'admin' },
    ],
    [isAdmin, mode]
  );

  const availableTabs = useMemo(() => tabConfigs.filter(tab => tab.show), [tabConfigs]);

  useEffect(() => {
    if (!availableTabs.some(tab => tab.key === activeTab)) {
      if (availableTabs.length > 0) {
        setActiveTab(availableTabs[0].key);
      }
    }
  }, [availableTabs, activeTab]);

  // Enhanced user blocking system
  const {
    blockUser,
    unblockUser: unblockUserEnhanced,
    isBlocked,
    canInteractWith
  } = useUserBlocking();

  // Load user profile and RSVPs
  useEffect(() => {
    if (!currentUser || !listenersReady) return;

    let active = true;

    setDisplayName(currentUser.displayName || '');
    setEmail(currentUser.email || '');
    setPhotoURL(currentUser.photoURL);
    setLoadingEvents(true);

    const applyEvents = (events: Event[]) => {
      if (!active) return;
      setRsvpedEvents(events);
      fetchUserNames(events.map(e => ({ id: e.createdBy })));
      setLoadingEvents(false);
    };

    const loadFallback = async () => {
      try {
        const userAttendeeQuery = query(
          collection(db, 'users', currentUser.id, 'attendances'),
          where('rsvpStatus', '==', 'going'),
          orderBy('updatedAt', 'desc')
        );
        const userAttendeeSnap = await getDocs(userAttendeeQuery);
        if (userAttendeeSnap.docs.length > 0) {
          const eventIds = userAttendeeSnap.docs
            .map(doc => doc.data().eventId)
            .filter(Boolean) as string[];
          if (eventIds.length) {
            const events: Event[] = [];
            const chunkSize = 10;
            for (let i = 0; i < eventIds.length; i += chunkSize) {
              const chunk = eventIds.slice(i, i + chunkSize);
              const eventsQuery = query(collection(db, 'events'), where('__name__', 'in', chunk));
              const eventsSnap = await getDocs(eventsQuery);
              const chunkEvents = eventsSnap.docs.map(d =>
                normalizeEvent({ id: d.id, ...sanitizeFirebaseData(d.data()) })
              );
              events.push(...chunkEvents);
            }
            events.sort((a, b) => {
              const aTime = a.startAt instanceof Date ? a.startAt.getTime() : 0;
              const bTime = b.startAt instanceof Date ? b.startAt.getTime() : 0;
              return bTime - aTime;
            });
            applyEvents(events);
            return;
          }
        }
      } catch (userAttendeeError) {
        console.log('⚠️ Profile: User attendee collection approach failed:', userAttendeeError);
      }

      console.log('ℹ️ Profile: No mirrored RSVPs available; skipping public event queries.');
      applyEvents([]);
    };

    const loadPrimary = async () => {
      try {
        const cg = query(
          collectionGroup(db, 'attendees'),
          where('userId', '==', currentUser.id),
          where('rsvpStatus', '==', 'going')
        );
        const cgSnap = await getDocs(cg);
        const eventIds = cgSnap.docs
          .map(d => d.ref.parent.parent?.id)
          .filter(Boolean) as string[];

        if (eventIds.length) {
          const events: Event[] = [];
          for (const id of eventIds) {
            const snap = await getDoc(doc(db, 'events', id));
            if (snap.exists()) {
              const sanitizedData = sanitizeFirebaseData(snap.data());
              events.push(normalizeEvent({ id: snap.id, ...sanitizedData }));
            }
          }
          applyEvents(events);
          return;
        }
      } catch (error) {
        console.log('Profile: collectionGroup attendees failed, falling back', error);
      }

      await loadFallback();
    };

    loadPrimary();

    return () => {
      active = false;
    };
  }, [currentUser, listenersReady]);

  // Load user-created and all events (for admins)
  useEffect(() => {
    if (!currentUser || !listenersReady) return; // Wait for listeners to be ready
    
    // Add a small delay to prevent race conditions
    const timer = setTimeout(() => {
      // User-created events
      const userQ = query(
        collection(db, 'events'),
        where('createdBy', '==', currentUser.id),
        orderBy('startAt', 'desc'),
        limit(PAGE_SIZE * eventsPage)
      );
      console.log('🔍 Profile: Setting up user events onSnapshot listener');
      const unsubUser = onSnapshot(userQ, (snap) => {
        console.log('🔍 Profile: User events onSnapshot callback fired', {
          docCount: snap.docs.length,
          hasData: snap.docs.length > 0
        });
        const events = snap.docs.map(d => {
          const rawData = d.data();
          const sanitizedData = sanitizeFirebaseData(rawData);
          return normalizeEvent({ id: d.id, ...sanitizedData });
        });
        setUserEvents(events);
        fetchUserNames(events.map(e => ({ id: e.createdBy })));
      }, (e) => {
        console.error('🚨 Profile: User events onSnapshot error:', {
          error: e,
          errorCode: e?.code,
          errorMessage: e?.message,
          errorStack: e?.stack
        });
        toast.error(e?.code === 'permission-denied' ? 'Events access denied' : 'Failed to load user events');
      });

      // Admin: all events
      let unsubAdmin: (() => void) | undefined;
      if (currentUser.role === 'admin') {
        setLoadingAdminEvents(true);
        const adminQ = query(
          collection(db, 'events'),
          orderBy('startAt', 'desc')
        );
        console.log('🔍 Profile: Setting up admin events onSnapshot listener');
        unsubAdmin = onSnapshot(adminQ, async (snap) => {
          console.log('🔍 Profile: Admin events onSnapshot callback fired', {
            docCount: snap.docs.length,
            hasData: snap.docs.length > 0,
            error: snap.metadata.fromCache ? 'from cache' : 'from server'
          });
          try {
            const events = snap.docs.map(d => {
              const rawData = d.data();
              const sanitizedData = sanitizeFirebaseData(rawData);
              return normalizeEvent({ id: d.id, ...sanitizedData });
            });
            console.log('🔍 Profile: Setting allEvents to:', events.length, 'events');
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
                  // Use new attendee system instead of old rsvps collection
                  const attendeeQuery = query(collection(db, 'events', event.id, 'attendees'), orderBy('createdAt', 'desc'));
                  const attendeeSnap = await getDocs(attendeeQuery);
                  // Keep all attendee records for complete admin visibility
                  rsvps[event.id] = attendeeSnap.docs.map(d => ({ 
                    id: d.id, 
                    eventId: event.id, 
                    userId: d.data().userId,
                    status: d.data().rsvpStatus, // Map rsvpStatus to status for compatibility
                    ...sanitizeFirebaseData(d.data()) 
                  }));
                })
              );
            }
            setRsvpsByEvent(rsvps);
            fetchUserNames([...events.map(e => ({ id: e.createdBy })), ...Object.values(rsvps).flat().map(rsvp => ({ id: rsvp.userId }))]);
          } catch (e) {
            console.error('🚨 Profile: Failed to load admin events:', {
              error: e,
              errorMessage: (e as any)?.message,
              errorStack: (e as any)?.stack
            });
            toast.error('Failed to load events');
          } finally {
            setLoadingAdminEvents(false);
          }
        }, (e) => {
          console.error('🚨 Profile: Admin events onSnapshot error:', {
            error: e,
            errorCode: e?.code,
            errorMessage: e?.message,
            errorStack: e?.stack
          });
          toast.error(e?.code === 'permission-denied' ? 'Admin events access denied' : 'Failed to load events');
          setLoadingAdminEvents(false);
        });
      }

      return () => {
        unsubUser();
        unsubAdmin?.();
      };
    }, 400); // 400ms delay (slightly more than RSVPed events)

    return () => clearTimeout(timer);
  }, [currentUser, listenersReady, eventsPage]); // Add listenersReady dependency

  // Load blocked users for admins
  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchBlockedUsers();
    }
  }, [currentUser?.role]);

  // Redirect non-admin users from RSVP tab to events tab
  useEffect(() => {
    if (mode === 'profile' && currentUser && currentUser.role !== 'admin' && activeTab === 'rsvp') {
      setActiveTab('events');
    }
  }, [currentUser, activeTab, mode]);

  // Listen for enhanced blocking modal requests
  useEffect(() => {
    const handleOpenBlockModal = (event: CustomEvent) => {
      setUserToBlock(event.detail.user);
      setShowBlockModal(true);
    };

    window.addEventListener('openBlockModal', handleOpenBlockModal as EventListener);
    
    return () => {
      window.removeEventListener('openBlockModal', handleOpenBlockModal as EventListener);
    };
  }, []);

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

  // City to ZIP lookup
  const lookupCity = async (city: string, state: string = 'NJ') => {
    if (!city || city.length < 3) {
      setZipSuggestions([]);
      setCityStatus('idle');
      return;
    }
    
    cityAbortRef.current?.abort();
    const ctrl = new AbortController();
    cityAbortRef.current = ctrl;
    setCityStatus('loading');
    
    try {
      // Use a different API for city-to-ZIP lookup
      const res = await fetch(`https://api.zippopotam.us/us/${state}/${city}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error('not found');
      const data = await res.json();
      const places = data?.places || [];
      const zips = places.map((place: any) => place['post code']).filter(Boolean);
      setZipSuggestions(zips);
      setCityStatus(zips.length > 0 ? 'ok' : 'error');
    } catch {
      setZipSuggestions([]);
      setCityStatus('error');
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
    const nameParts = [firstName, lastName].filter(Boolean);
    const computedDisplay = nameParts.length > 0 ? nameParts.join(' ') : (displayName || 'Member');
    try {
      setSaving(true);
      // Clean social links - remove empty strings to avoid validation issues
      const cleanSocial = Object.fromEntries(
        Object.entries(social).filter(([key, value]) => value && value.trim())
      );
      
      const updateData: any = {
        firstName: firstName || '',
        lastName: lastName || '',
        displayName: computedDisplay,
        email: email || '',
        social: cleanSocial,
        interests,
        about: (about || '').trim(),
        updatedAt: serverTimestamp(),
      };
      
      // Only include address if there's actual address data
      if (hasAnyAddress) {
        updateData.address = {
          street: address.street || '',
          city: address.city || '',
          state: address.state || 'NJ',
          postalCode: address.postalCode || '',
        };
      }
      
      await updateDoc(doc(db, 'users', currentUser!.id), updateData);
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

  // Refresh RSVP data for admin
  const refreshRsvpData = async () => {
    if (currentUser?.role !== 'admin' || allEvents.length === 0) return;
    
    try {
      console.log('DEBUG: Refreshing RSVP data for', allEvents.length, 'events');
      const rsvps: { [eventId: string]: any[] } = {};
      
      for (const event of allEvents) {
        // Fetch from the attendees collection to get all individual attendees
        const attendeeQuery = query(collection(db, 'events', event.id, 'attendees'), orderBy('createdAt', 'desc'));
        const attendeeSnap = await getDocs(attendeeQuery);
        if (attendeeSnap.docs.length > 0) {
          rsvps[event.id] = attendeeSnap.docs.map(d => ({ 
            id: d.id, 
            eventId: event.id, 
            userId: d.data().userId,
            status: d.data().rsvpStatus, // Map rsvpStatus to status for compatibility
            ...sanitizeFirebaseData(d.data()) 
          }));
        }
      }
      
      console.log('DEBUG: Fetched RSVP data:', rsvps);
      setRsvpsByEvent(rsvps);
      console.log('DEBUG: RSVP data refreshed successfully');
    } catch (e) {
      console.error('DEBUG: Failed to refresh RSVP data:', e);
    }
  };

  // Update RSVP
  const updateRsvp = async (eventId: string, attendeeId: string, status: 'going' | 'not-going' | 'waitlisted' | null) => {
    try {
      console.log('DEBUG: updateRsvp called with:', { eventId, attendeeId, status });
      
      // Update the specific attendee record
      const attendeeRef = doc(db, 'events', eventId, 'attendees', attendeeId);
      const attendeeSnap = await getDoc(attendeeRef);
      
      if (!attendeeSnap.exists()) {
        console.log('DEBUG: Attendee not found:', attendeeId);
        toast.error('Attendee not found');
        return;
      }
      
      const existing = attendeeSnap.data();
      const newHistory = [
        ...(existing.statusHistory || []),
        {
          status,
          changedAt: new Date(),
          changedBy: currentUser!.id,
        }
      ];
      
      const updateData: any = {
        rsvpStatus: status,
        updatedAt: serverTimestamp(),
        statusHistory: newHistory,
      };
      
      // Only set createdAt if it doesn't exist (new document)
      if (!existing.createdAt) {
        updateData.createdAt = serverTimestamp();
      }
      
      console.log('DEBUG: Updating attendee', attendeeId, 'with status:', status);
      await updateDoc(attendeeRef, updateData);
      console.log('DEBUG: updateRsvp completed successfully');
      
      // Refresh RSVP data after successful update
      await refreshRsvpData();
      
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
      
      const blocked = snapshot.docs.map(doc => {
        const rawData = doc.data();
        const sanitizedData = sanitizeFirebaseData(rawData);
        return {
          id: doc.id,
          ...sanitizedData
        };
      }).filter(user => user.blockedFromRsvp === true);
      
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
      const attendeeDetails = await Promise.all(
        rsvps.map(async (attendee) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', attendee.userId));
            if (userDoc.exists()) {
              const rawData = userDoc.data();
              const userData = sanitizeFirebaseData(rawData);
              return {
                // Attendee-specific data
                attendeeId: attendee.attendeeId || attendee.id,
                attendeeName: attendee.name || attendee.attendeeName || '',
                attendeeType: attendee.attendeeType || 'primary',
                ageGroup: attendee.ageGroup || '',
                relationship: attendee.relationship || '',
                rsvpStatus: attendee.status,
                // User data
                userId: attendee.userId,
                firstName: userData.firstName || '',
                lastName: userData.lastName || '',
                displayName: userData.displayName || '',
                email: userData.email || '',
                phone: userData.phoneNumber || userData.phone || '',
                address: userData.address ? `${userData.address.street || ''} ${userData.address.city || ''} ${userData.address.state || ''} ${userData.address.postalCode || ''}`.trim() : '',
                // Dates - use sanitized data
                rsvpDate: attendee.createdAt instanceof Date ? attendee.createdAt.toLocaleDateString('en-US') : 'Unknown',
                updatedDate: attendee.updatedAt instanceof Date ? attendee.updatedAt.toLocaleDateString('en-US') : 'Unknown'
              };
            }
            return {
              // Attendee-specific data
              attendeeId: attendee.id,
              attendeeName: attendee.name || attendee.attendeeName || 'Unknown',
              attendeeType: attendee.attendeeType || 'primary',
              ageGroup: attendee.ageGroup || '',
              relationship: attendee.relationship || '',
              rsvpStatus: attendee.status,
              // User data
              userId: attendee.userId,
              firstName: 'Unknown',
              lastName: 'User',
              displayName: 'Unknown User',
              email: '',
              phone: '',
              address: '',
              // Dates - use sanitized data
              rsvpDate: attendee.createdAt instanceof Date ? attendee.createdAt.toLocaleDateString('en-US') : 'Unknown',
              updatedDate: attendee.updatedAt instanceof Date ? attendee.updatedAt.toLocaleDateString('en-US') : 'Unknown'
            };
          } catch {
            return {
              // Attendee-specific data
              attendeeId: attendee.id,
              attendeeName: attendee.name || attendee.attendeeName || 'Error',
              attendeeType: attendee.attendeeType || 'primary',
              ageGroup: attendee.ageGroup || '',
              relationship: attendee.relationship || '',
              rsvpStatus: attendee.status,
              // User data
              userId: attendee.userId,
              firstName: 'Error',
              lastName: 'Loading',
              displayName: 'Error Loading User',
              email: '',
              phone: '',
              address: '',
              // Dates - use sanitized data
              rsvpDate: attendee.createdAt instanceof Date ? attendee.createdAt.toLocaleDateString('en-US') : 'Unknown',
              updatedDate: attendee.updatedAt instanceof Date ? attendee.updatedAt.toLocaleDateString('en-US') : 'Unknown'
            };
          }
        })
      );
      const headers = [
        'Attendee ID',
        'Attendee Name',
        'Attendee Type',
        'Age Group',
        'Relationship',
        'RSVP Status',
        'User ID',
        'Primary User First Name',
        'Primary User Last Name',
        'Primary User Display Name',
        'Email',
        'Phone',
        'Address',
        'RSVP Date',
        'Updated Date'
      ];
      const csvRows = [
        headers.join(','),
        ...attendeeDetails.map(attendee => [
          attendee.attendeeId,
          `"${attendee.attendeeName}"`,
          attendee.attendeeType,
          attendee.ageGroup,
          attendee.relationship,
          attendee.rsvpStatus,
          attendee.userId,
          `"${attendee.firstName}"`,
          `"${attendee.lastName}"`,
          `"${attendee.displayName}"`,
          `"${attendee.email}"`,
          `"${attendee.phone}"`,
          `"${attendee.address}"`,
          attendee.rsvpDate,
          attendee.updatedDate
        ].join(','))
      ];
      const csv = csvRows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${event.title.replace(/[^a-z0-9]/gi, '_')}_rsvps_${safeISODate(new Date())}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${attendeeDetails.length} attendees with full details including age groups`);
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
          getDoc(doc(db, 'users', userId)).then(snap => {
            if (snap.exists()) {
              const rawData = snap.data();
              const sanitizedData = sanitizeFirebaseData(rawData);
              return {
                userId,
                displayName: sanitizedData.displayName || [sanitizedData.firstName, sanitizedData.lastName].filter(Boolean).join(' ') || 'Unknown User'
              };
            }
            return {
              userId,
              displayName: 'Unknown User'
            };
          })
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

  // Adjust waitlist count
  const adjustWaitlistCount = async (eventId: string, increment: boolean) => {
    try {
      const eventRef = doc(db, 'events', eventId);
      const eventSnap = await getDoc(eventRef);
      const currentCount = eventSnap.data()?.waitlistCount || 0;
      await updateDoc(eventRef, { waitlistCount: Math.max(0, currentCount + (increment ? 1 : -1)) });
      toast.success('Waitlist count updated');
    } catch (e: any) {
      console.error('Failed to update waitlist count:', e);
      toast.error(e?.message || 'Failed to update waitlist count');
    }
  };

  // Toggle read-only status
  const toggleReadOnlyStatus = async (eventId: string) => {
    try {
      const eventRef = doc(db, 'events', eventId);
      const eventSnap = await getDoc(eventRef);
      const currentStatus = eventSnap.data()?.isReadOnly || false;
      await updateDoc(eventRef, { isReadOnly: !currentStatus });
      toast.success(`Event ${!currentStatus ? 'set to read-only' : 'set to interactive'}`);
    } catch (e: any) {
      console.error('Failed to toggle read-only status:', e);
      toast.error(e?.message || 'Failed to toggle read-only status');
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
    const eventStartTime = eventStart instanceof Date ? eventStart.getTime() : Date.now();
    return history.filter((h: any) => {
      const changeTime = h.changedAt instanceof Date ? h.changedAt.getTime() : 0;
      return h.status === 'not-going' && (eventStartTime - changeTime) <= 24 * 60 * 60 * 1000;
    }).length;
  };

  const cityOptions = useMemo(() => NJ_CITIES, []);

  const containerWidthClass = mode === 'admin' ? 'max-w-6xl' : 'max-w-3xl';
  const headingText = mode === 'admin' ? 'Admin Console' : 'My Profile';

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
    <div className={`${containerWidthClass} mx-auto px-4 py-12`}>
      <div className="rounded-2xl border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold mb-6">{headingText}</h1>
        {/* Tabs */}
        <div className="flex flex-wrap gap-1 mb-8 bg-gray-100 p-1 rounded-lg">
          {availableTabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${
                activeTab === tab.key ? 'bg-white text-[#F25129] shadow-sm' : 'text-gray-600 hover:text-[#F25129]'
              }`}
              aria-selected={activeTab === tab.key}
            >
              {tab.label}
            </button>
          ))}
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
            phoneNumber={phoneNumber}
            photoURL={photoURL}
            about={about}
            setAbout={setAbout}
            address={address}
            setAddress={setAddress}
            zipStatus={zipStatus}
            setZipStatus={setZipStatus}
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
            lookupCity={lookupCity}
            zipSuggestions={zipSuggestions}
            setZipSuggestions={setZipSuggestions}
            cityStatus={cityStatus}
            setCityStatus={setCityStatus}
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
        {activeTab === 'rsvp' && currentUser?.role === 'admin' && (
          <ProfileRSVPAdminTab
            rsvpsByEvent={rsvpsByEvent}
            allEvents={allEvents}
            userNames={userNames}
            updateRsvp={updateRsvp}
            exportRsvps={exportRsvps}
            exportingRsvps={exportingRsvps}
            adjustAttendingCount={adjustAttendingCount}
            adjustWaitlistCount={adjustWaitlistCount}
            blockUserFromRsvp={blockUserFromRsvp}
            analyzeLastMinuteChanges={analyzeLastMinuteChanges}
            rsvpFilter={rsvpFilter}
            setRsvpFilter={setRsvpFilter}
            eventsPage={eventsPage}
            setEventsPage={setEventsPage}
            PAGE_SIZE={PAGE_SIZE}
            loadingAdminEvents={loadingAdminEvents}
            currentUser={currentUser}
            toggleReadOnlyStatus={toggleReadOnlyStatus}
          />
        )}
        {activeTab === 'admin' && mode === 'admin' && currentUser?.role === 'admin' && (
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
        {activeTab === 'knowledge' && mode === 'admin' && currentUser?.role === 'admin' && (
          <AdminKnowledgeBaseTab />
        )}
        {activeTab === 'family' && (
          <div className="space-y-6">
            <div className="border-b border-gray-200 pb-4">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Family Member Management</h2>
              <p className="text-gray-600">
                Manage your family members to streamline RSVP processes and event planning.
              </p>
            </div>
            <FamilyMemberList />
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

      {/* Enhanced User Blocking Modal */}
      {showBlockModal && userToBlock && (
        <UserBlockModal
          isOpen={showBlockModal}
          onClose={() => {
            setShowBlockModal(false);
            setUserToBlock(null);
          }}
          targetUser={userToBlock}
          onBlock={async (targetUserId, reason, category, description, expiresAt) => {
            try {
              await blockUser(targetUserId, reason, category, description, expiresAt);
              // Refresh blocked users list
              fetchBlockedUsers();
            } catch (error) {
              console.error('Failed to block user:', error);
            }
          }}
        />
      )}
    </div>
  );
};

export default Profile;


