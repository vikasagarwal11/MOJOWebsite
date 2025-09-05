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
import { ProfileRSVPPersonalTab } from './ProfileRSVPPersonalTab';
import { ProfileAdminTab } from './ProfileAdminTab';
import CreateEventModal from '../components/events/CreateEventModal';
import { useUserBlocking } from '../hooks/useUserBlocking';
import { UserBlockModal } from '../components/user/UserBlockModal';
import { FamilyMemberList } from '../components/family/FamilyMemberList';

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
  const { currentUser, listenersReady } = useAuth();
  const [activeTab, setActiveTab] = useState<'personal' | 'events' | 'rsvp' | 'admin' | 'family'>('personal');
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

  // Enhanced user blocking system
  const {
    blockUser,
    unblockUser: unblockUserEnhanced,
    isBlocked,
    canInteractWith
  } = useUserBlocking();

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
          setPhoneNumber(d.phoneNumber || currentUser.phoneNumber || '');
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
    if (!currentUser || !listenersReady) return; // Wait for listeners to be ready
    
    // Add a small delay to prevent race conditions
    const timer = setTimeout(() => {
      setLoadingNotifications(true);
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', currentUser.id),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE * notificationsPage)
      );
      const controller = new AbortController();
      console.log('🔍 Profile: Setting up notifications onSnapshot listener');
      const unsubscribe = onSnapshot(q, (snap) => {
        console.log('🔍 Profile: Notifications onSnapshot callback fired', {
          docCount: snap.docs.length,
          hasData: snap.docs.length > 0
        });
        if (!controller.signal.aborted) {
          setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setLoadingNotifications(false);
        }
      }, (e) => {
        console.error('🚨 Profile: Notifications onSnapshot error:', {
          error: e,
          errorCode: e?.code,
          errorMessage: e?.message,
          errorStack: e?.stack
        });
        setLoadingNotifications(false);
        toast.error(e?.code === 'permission-denied' ? 'Notifications access denied' : 'Failed to load notifications');
      });
      return () => {
        controller.abort();
        unsubscribe();
      };
    }, 200); // 200ms delay to prevent race conditions

    return () => clearTimeout(timer);
  }, [currentUser, listenersReady, notificationsPage]); // Add listenersReady dependency

  // Load RSVPed events
  useEffect(() => {
    if (!currentUser || !listenersReady) return; // Wait for listeners to be ready
    
    // Add a small delay to prevent race conditions
    const timer = setTimeout(() => {
      setLoadingEvents(true);
      
            // Since collection group queries on attendees require special permissions,
      // we'll use a different approach that works with current security rules
      const loadRSVPedEvents = async () => {
        try {
          console.log('🔍 Profile: Using alternative approach for loading RSVPed events');
          
          // Instead of collection group query, we'll use the fallback approach directly
          // This works with current security rules and doesn't require special permissions
          await loadRSVPedEventsFallback();
        } catch (error) {
          console.error('🚨 Profile: Error in alternative approach:', error);
          setLoadingEvents(false);
          toast.error('Failed to load RSVPed events');
        }
      };
      
             // Fallback approach: manually check events for user RSVPs
       const loadRSVPedEventsFallback = async () => {
         try {
           console.log('🔄 Profile: Using fallback approach to load RSVPed events');
           
           // For non-admin users, we can't read all events due to security rules
           // Instead, let's try to get events from the user's RSVP collection if it exists
           // or check if we can find any events the user has interacted with
           
           console.log('🔄 Profile: Non-admin user detected, using limited fallback approach');
           
                                   // Try to get events from user's attendee collection (if it exists)
             // This is a workaround for permission restrictions
             try {
               const userAttendeeQuery = query(
                 collection(db, 'users', currentUser.id, 'attendees'),
                 where('rsvpStatus', '==', 'going'),
                 orderBy('updatedAt', 'desc')
               );
               
               const userAttendeeSnap = await getDocs(userAttendeeQuery);
               console.log('🔍 Profile: User attendee collection query result:', {
                 docCount: userAttendeeSnap.docs.length,
                 hasData: userAttendeeSnap.docs.length > 0
               });
               
               if (userAttendeeSnap.docs.length > 0) {
                 // Extract event IDs from user's attendee collection
                 const eventIds = userAttendeeSnap.docs.map(doc => doc.data().eventId).filter(Boolean);
                 console.log('🔍 Profile: Found event IDs in user attendee collection:', eventIds);
                 
                 if (eventIds.length > 0) {
                   // Fetch these specific events
                   const eventsQuery = query(
                     collection(db, 'events'),
                     where('__name__', 'in', eventIds),
                     orderBy('startAt', 'desc')
                   );
                   
                   const eventsSnap = await getDocs(eventsQuery);
                   const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                   
                   console.log('🔍 Profile: Successfully fetched events from user attendee collection:', {
                     eventCount: events.length,
                     eventIds: events.map(e => e.id)
                   });
                   
                   setRsvpedEvents(events);
                   fetchUserNames(events.map(e => ({ id: e.createdBy })));
                   setLoadingEvents(false);
                   return;
                 }
               }
             } catch (userAttendeeError) {
               console.log('⚠️ Profile: User attendee collection approach failed:', userAttendeeError);
               console.log('🔍 Profile: This is expected if the subcollection doesn\'t exist yet');
             }
           
           // If user RSVP collection approach fails, try to get events the user has permission to read
           // For non-admin users, this might be limited to events they're invited to or have RSVPed to
           console.log('🔄 Profile: Trying alternative approach - checking for events user can access');
           
                                               // Since the user attendee collection approach failed, let's try a different strategy
             // We'll query for events that the user might have access to and then check their attendees
             console.log('🔄 Profile: Trying to find events user can access...');
             
             let events: any[] = [];
             
             // Try multiple approaches to find events
             try {
               // Approach 1: Try public events first (this should work with current security rules)
               const publicEventsQuery = query(
                 collection(db, 'events'),
                 where('visibility', '==', 'public'),
                 orderBy('startAt', 'desc'),
                 limit(50)
               );
               const publicEventsSnap = await getDocs(publicEventsQuery);
               events = publicEventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
               console.log('🔍 Profile: Found events with public events query:', events.length);
             } catch (publicEventsError) {
               console.log('⚠️ Profile: Public events query failed:', publicEventsError);
               
               // Approach 2: Try legacy 'public' field (for backward compatibility)
               try {
                 const legacyPublicQuery = query(
                   collection(db, 'events'),
                   where('public', '==', true),
                   orderBy('startAt', 'desc'),
                   limit(50)
                 );
                 const legacyPublicSnap = await getDocs(legacyPublicQuery);
                 events = legacyPublicSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                 console.log('🔍 Profile: Found events with legacy public query:', events.length);
               } catch (legacyPublicError) {
                 console.log('⚠️ Profile: Legacy public query failed:', legacyPublicError);
                 
                 // Approach 3: Try events created by the user
                 try {
                   const userEventsQuery = query(
                     collection(db, 'events'),
                     where('createdBy', '==', currentUser.id),
                     orderBy('startAt', 'desc'),
                     limit(20)
                   );
                   const userEventsSnap = await getDocs(userEventsQuery);
                   events = userEventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                   console.log('🔍 Profile: Found events with user events query:', events.length);
                 } catch (userEventsError) {
                   console.log('⚠️ Profile: User events query failed:', userEventsError);
                   
                   // Approach 4: Try events where user is invited
                   try {
                     const invitedEventsQuery = query(
                       collection(db, 'events'),
                       where('invitedUserIds', 'array-contains', currentUser.id),
                       orderBy('startAt', 'desc'),
                       limit(20)
                     );
                     const invitedEventsSnap = await getDocs(invitedEventsQuery);
                     events = invitedEventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                     console.log('🔍 Profile: Found events with invited events query:', events.length);
                   } catch (invitedEventsError) {
                     console.log('⚠️ Profile: Invited events query failed:', invitedEventsError);
                     events = [];
                   }
                 }
               }
             }
            
            if (events.length === 0) {
              console.log('⚠️ Profile: No events found with any approach');
              setRsvpedEvents([]);
              setLoadingEvents(false);
              return;
            }
            
            // Check each event for user's attendees
            const rsvpedEventIds: string[] = [];
            console.log(`🔍 Profile: Checking ${events.length} events for attendees...`);
            
            for (const event of events) {
              try {
                // Check if user has any attendees with 'going' status for this event
                const attendeesQuery = query(
                  collection(db, 'events', event.id, 'attendees'),
                  where('userId', '==', currentUser.id),
                  where('rsvpStatus', '==', 'going')
                );
                const attendeesSnap = await getDocs(attendeesQuery);
                
                console.log(`🔍 Profile: Checking attendees for event ${event.id} (${event.title}):`, {
                  attendeeCount: attendeesSnap.docs.length,
                  hasGoingAttendees: attendeesSnap.docs.length > 0
                });
                
                if (attendeesSnap.docs.length > 0) {
                  rsvpedEventIds.push(event.id);
                  console.log(`✅ Profile: Found going attendees for event ${event.id}`);
                }
              } catch (attendeeError) {
                console.log(`⚠️ Profile: Could not check attendees for event ${event.id}:`, attendeeError);
              }
            }
            
            console.log('🔍 Profile: Fallback found events with going attendees:', rsvpedEventIds);
            
            // Filter events to only show ones with going attendees
            const rsvpedEvents = events.filter(event => rsvpedEventIds.includes(event.id));
            setRsvpedEvents(rsvpedEvents);
            fetchUserNames(rsvpedEvents.map(e => ({ id: e.createdBy })));
            setLoadingEvents(false);
          
        } catch (error) {
          console.error('🚨 Profile: Fallback approach also failed:', error);
          setRsvpedEvents([]);
          setLoadingEvents(false);
          toast.error('Failed to load RSVPed events');
        }
      };
      
      loadRSVPedEvents();
    }, 300); // 300ms delay (slightly more than notifications)

    return () => clearTimeout(timer);
  }, [currentUser, listenersReady, eventsPage]); // Add listenersReady dependency

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
        const events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
          orderBy('startAt', 'desc'),
          limit(PAGE_SIZE * eventsPage)
        );
        console.log('🔍 Profile: Setting up admin events onSnapshot listener');
        unsubAdmin = onSnapshot(adminQ, async (snap) => {
          console.log('🔍 Profile: Admin events onSnapshot callback fired', {
            docCount: snap.docs.length,
            hasData: snap.docs.length > 0
          });
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
                  // Use new attendee system instead of old rsvps collection
                  const attendeeQuery = query(collection(db, 'events', event.id, 'attendees'), orderBy('createdAt', 'desc'));
                  const attendeeSnap = await getDocs(attendeeQuery);
                  // Keep all attendee records for complete admin visibility
                  rsvps[event.id] = attendeeSnap.docs.map(d => ({ 
                    id: d.id, 
                    eventId: event.id, 
                    userId: d.data().userId,
                    status: d.data().rsvpStatus, // Map rsvpStatus to status for compatibility
                    ...d.data() 
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
    if (currentUser && currentUser.role !== 'admin' && activeTab === 'rsvp') {
      setActiveTab('events');
    }
  }, [currentUser, activeTab]);

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
            ...d.data() 
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
  const updateRsvp = async (eventId: string, attendeeId: string, status: 'going' | 'not-going' | 'pending' | null) => {
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
      const attendeeDetails = await Promise.all(
        rsvps.map(async (attendee) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', attendee.userId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              return {
                // Attendee-specific data
                attendeeId: attendee.id,
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
                // Dates
                rsvpDate: attendee.createdAt?.toDate?.() ? new Date(attendee.createdAt.toDate()).toLocaleDateString('en-US') : 'Unknown',
                updatedDate: attendee.updatedAt?.toDate?.() ? new Date(attendee.updatedAt.toDate()).toLocaleDateString('en-US') : 'Unknown'
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
              // Dates
              rsvpDate: attendee.createdAt?.toDate?.() ? new Date(attendee.createdAt.toDate()).toLocaleDateString('en-US') : 'Unknown',
              updatedDate: attendee.updatedAt?.toDate?.() ? new Date(attendee.updatedAt.toDate()).toLocaleDateString('en-US') : 'Unknown'
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
              // Dates
              rsvpDate: attendee.createdAt?.toDate?.() ? new Date(attendee.createdAt.toDate()).toLocaleDateString('en-US') : 'Unknown',
              updatedDate: attendee.updatedAt?.toDate?.() ? new Date(attendee.updatedAt.toDate()).toLocaleDateString('en-US') : 'Unknown'
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
      a.download = `${event.title.replace(/[^a-z0-9]/gi, '_')}_rsvps_${new Date().toISOString().split('T')[0]}.csv`;
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
            className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${activeTab === 'personal' ? 'bg-white text-[#F25129] shadow-sm' : 'text-gray-600 hover:text-[#F25129]'}`}
            aria-selected={activeTab === 'personal'}
          >
            Personal
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${activeTab === 'events' ? 'bg-white text-[#F25129] shadow-sm' : 'text-gray-600 hover:text-[#F25129]'}`}
            aria-selected={activeTab === 'events'}
          >
            {currentUser?.role === 'admin' ? 'My Events' : 'Events I\'m Attending'}
          </button>
          {currentUser?.role === 'admin' && (
            <button
              onClick={() => setActiveTab('rsvp')}
              className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${activeTab === 'rsvp' ? 'bg-white text-[#F25129] shadow-sm' : 'text-gray-600 hover:text-[#F25129]'}`}
              aria-selected={activeTab === 'rsvp'}
            >
              RSVP Management
            </button>
          )}
          <button
            onClick={() => setActiveTab('family')}
            className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${activeTab === 'family' ? 'bg-white text-[#F25129] shadow-sm' : 'text-gray-600 hover:text-[#F25129]'}`}
            aria-selected={activeTab === 'family'}
          >
            Family Management
          </button>
          {currentUser?.role === 'admin' && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${activeTab === 'admin' ? 'bg-white text-[#F25129] shadow-sm' : 'text-gray-600 hover:text-[#F25129]'}`}
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
            phoneNumber={phoneNumber}
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
        {activeTab === 'rsvp' && currentUser?.role === 'admin' && (
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
