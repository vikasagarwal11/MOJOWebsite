import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  writeBatch,
  onSnapshot,
  DocumentData,
  QuerySnapshot
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  Attendee, 
  CreateAttendeeData, 
  UpdateAttendeeData, 
  AttendeeCounts, 
  AttendeeStatus
} from '../types/attendee';

// Generate unique attendee ID
const generateAttendeeId = (): string => {
  return `attendee_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Validate attendee data
export const validateAttendee = (data: CreateAttendeeData): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!data.eventId) errors.push('Event ID is required');
  if (!data.userId) errors.push('User ID is required');
  if (!data.name || data.name.trim().length < 2) errors.push('Name must be at least 2 characters');
  if (!data.attendeeType) errors.push('Attendee type is required');
  if (!data.relationship) errors.push('Relationship is required');
  if (!data.ageGroup) errors.push('Age group is required');
  if (!data.rsvpStatus) errors.push('RSVP status is required');

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Check if primary member is "going" (required for family members to join)
export const checkPrimaryMemberStatus = async (eventId: string, userId: string): Promise<{ canAdd: boolean; primaryStatus: string; message?: string }> => {
  try {
    const attendeesRef = collection(db, 'events', eventId, 'attendees');
    const primaryQuery = query(
      attendeesRef, 
      where('userId', '==', userId),
      where('attendeeType', '==', 'primary')
    );
    const primarySnapshot = await getDocs(primaryQuery);
    
    if (primarySnapshot.empty) {
      return {
        canAdd: false,
        primaryStatus: 'not_found',
        message: 'Primary member must join first before adding family members.'
      };
    }
    
    const primaryAttendee = primarySnapshot.docs[0].data();
    const isPrimaryGoing = primaryAttendee.rsvpStatus === 'going';
    
    if (!isPrimaryGoing) {
      return {
        canAdd: false,
        primaryStatus: primaryAttendee.rsvpStatus,
        message: `Primary member must be "going" to add family members. Current status: ${primaryAttendee.rsvpStatus}`
      };
    }
    
    return { canAdd: true, primaryStatus: primaryAttendee.rsvpStatus };
  } catch (error) {
    console.error('Error checking primary member status:', error);
    return { 
      canAdd: false, 
      primaryStatus: 'error', 
      message: 'Unable to verify primary member status. Please try again.' 
    };
  }
};

// Check family size limit (max 4 family members per primary)
export const checkFamilySizeLimit = async (eventId: string, userId: string): Promise<{ canAdd: boolean; currentCount: number; message?: string }> => {
  try {
    const attendeesRef = collection(db, 'events', eventId, 'attendees');
    const familyQuery = query(
      attendeesRef, 
      where('userId', '==', userId),
      where('attendeeType', '==', 'family_member')
    );
    const familySnapshot = await getDocs(familyQuery);
    const currentFamilyCount = familySnapshot.size;
    
    const maxFamilyMembers = 4; // Primary + 4 family members = 5 total
    const canAdd = currentFamilyCount < maxFamilyMembers;
    
    if (!canAdd) {
      return {
        canAdd: false,
        currentCount: currentFamilyCount,
        message: `Maximum family size reached (${maxFamilyMembers} family members). You can add up to ${maxFamilyMembers} family members.`
      };
    }
    
    return { canAdd: true, currentCount: currentFamilyCount };
  } catch (error) {
    console.error('Error checking family size limit:', error);
    return { 
      canAdd: false, 
      currentCount: 0, 
      message: 'Unable to verify family size limit. Please try again.' 
    };
  }
};

// Check event capacity before allowing new RSVPs
export const checkEventCapacity = async (eventId: string, requestedAttendeeCount: number = 1): Promise<{ canAdd: boolean; remaining: number; message?: string }> => {
  try {
    // Get event details to check maxAttendees
    const eventRef = doc(db, 'events', eventId);
    const eventDoc = await getDoc(eventRef);
    
    if (!eventDoc.exists()) {
      throw new Error('Event not found');
    }
    
    const eventData = eventDoc.data();
    const maxAttendees = eventData.maxAttendees;
    
    // If no capacity limit set, allow unlimited
    if (!maxAttendees) {
      return { canAdd: true, remaining: Infinity };
    }
    
    // Get current attendee count (only those with 'going' status)
    const attendeesRef = collection(db, 'events', eventId, 'attendees');
    const goingQuery = query(attendeesRef, where('rsvpStatus', '==', 'going'));
    const goingSnapshot = await getDocs(goingQuery);
    const currentGoingCount = goingSnapshot.size;
    
    const remaining = maxAttendees - currentGoingCount;
    const canAdd = remaining >= requestedAttendeeCount;
    
    if (!canAdd) {
      return {
        canAdd: false,
        remaining,
        message: remaining === 0 
          ? 'Event is at full capacity. No more RSVPs can be accepted.'
          : `Only ${remaining} spot${remaining === 1 ? '' : 's'} remaining, but you're trying to add ${requestedAttendeeCount}.`
      };
    }
    
    return { canAdd: true, remaining };
  } catch (error) {
    console.error('Error checking event capacity:', error);
    // In case of error, be conservative and block the addition
    return { 
      canAdd: false, 
      remaining: 0, 
      message: 'Unable to verify event capacity. Please try again.' 
    };
  }
};

// Create or update a single attendee
export const upsertAttendee = async (attendeeData: CreateAttendeeData): Promise<string> => {
  const validation = validateAttendee(attendeeData);
  if (!validation.isValid) {
    throw new Error(`Invalid attendee data: ${validation.errors.join(', ')}`);
  }

  // Check primary member status and family size limit for family members
  if (attendeeData.attendeeType === 'family_member') {
    // First check if primary member is "going"
    const primaryStatusCheck = await checkPrimaryMemberStatus(attendeeData.eventId, attendeeData.userId);
    if (!primaryStatusCheck.canAdd) {
      throw new Error(primaryStatusCheck.message || 'Primary member must be "going" to add family members');
    }
    
    // Then check family size limit
    const familySizeCheck = await checkFamilySizeLimit(attendeeData.eventId, attendeeData.userId);
    if (!familySizeCheck.canAdd) {
      throw new Error(familySizeCheck.message || 'Maximum family size reached');
    }
  }

  // Check capacity only for 'going' status
  if (attendeeData.rsvpStatus === 'going') {
    const capacityCheck = await checkEventCapacity(attendeeData.eventId, 1);
    if (!capacityCheck.canAdd) {
      // Only auto-waitlist primary users, not family members
      // Family members should be allowed to join as "going" even when event is full
      if (attendeeData.attendeeType === 'primary') {
        // Check if we should auto-waitlist the primary user instead of throwing error
        const eventRef = doc(db, 'events', attendeeData.eventId);
        const eventDoc = await getDoc(eventRef);
        
        if (eventDoc.exists()) {
          const eventData = eventDoc.data();
          if (eventData.waitlistEnabled) {
            // Auto-waitlist the primary user instead of throwing error
            attendeeData.rsvpStatus = 'waitlisted';
            console.log('Auto-waitlisting primary user due to capacity limit');
          } else {
            throw new Error(capacityCheck.message || 'Event is at capacity');
          }
        } else {
          throw new Error(capacityCheck.message || 'Event is at capacity');
        }
      } else {
        // For family members, allow them to join as "going" even when event is full
        // This allows the primary user to bring family members to a full event
        console.log('Allowing family member to join as "going" despite capacity limit');
      }
    }
  }

  const attendeeId = generateAttendeeId();
  const attendee: Attendee = {
    attendeeId,
    ...attendeeData,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const attendeeRef = doc(db, 'events', attendeeData.eventId, 'attendees', attendeeId);
  await setDoc(attendeeRef, attendee);

  return attendeeId;
};

// Cascade status change from primary member to all family members
export const cascadePrimaryStatusChange = async (
  eventId: string, 
  userId: string, 
  newStatus: AttendeeStatus
): Promise<void> => {
  try {
    console.log('DEBUG: Cascading primary status change:', { eventId, userId, newStatus });
    
    // Get all family members for this user
    const attendeesRef = collection(db, 'events', eventId, 'attendees');
    const familyQuery = query(
      attendeesRef, 
      where('userId', '==', userId),
      where('attendeeType', '==', 'family_member')
    );
    const familySnapshot = await getDocs(familyQuery);
    
    if (familySnapshot.empty) {
      console.log('DEBUG: No family members found to cascade status change');
      return;
    }
    
    // Update all family members to match primary status
    const batch = writeBatch(db);
    familySnapshot.docs.forEach(doc => {
      const familyRef = doc.ref;
      batch.update(familyRef, {
        rsvpStatus: newStatus,
        updatedAt: new Date()
      });
    });
    
    await batch.commit();
    console.log('DEBUG: Successfully cascaded status change to', familySnapshot.size, 'family members');
  } catch (error) {
    console.error('Error cascading primary status change:', error);
    throw error;
  }
};

// Update existing attendee
export const updateAttendee = async (
  eventId: string, 
  attendeeId: string, 
  updateData: UpdateAttendeeData
): Promise<void> => {
  console.log('DEBUG: updateAttendee service called with:', { eventId, attendeeId, updateData });
  const attendeeRef = doc(db, 'events', eventId, 'attendees', attendeeId);
  
  // Get the current attendee data to check if it's a primary member
  const attendeeDoc = await getDoc(attendeeRef);
  if (!attendeeDoc.exists()) {
    throw new Error('Attendee not found');
  }
  
  const attendeeData = attendeeDoc.data();
  const isPrimaryMember = attendeeData.attendeeType === 'primary';
  const isStatusChange = updateData.rsvpStatus && updateData.rsvpStatus !== attendeeData.rsvpStatus;
  
  // Check capacity limits when changing to 'going' status
  if (isStatusChange && updateData.rsvpStatus === 'going') {
    // Only check capacity for primary members, not family members
    // Family members can exceed capacity to allow complete families to attend together
    if (attendeeData.attendeeType === 'primary') {
      const capacityCheck = await checkEventCapacity(eventId, 1);
      if (!capacityCheck.canAdd) {
        // Check if waitlist is enabled for auto-waitlisting
        const eventRef = doc(db, 'events', eventId);
        const eventDoc = await getDoc(eventRef);
        
        if (eventDoc.exists()) {
          const eventData = eventDoc.data();
          if (eventData.waitlistEnabled) {
            // Auto-waitlist the primary user instead of allowing them to go
            updateData.rsvpStatus = 'waitlisted';
            console.log('DEBUG: Auto-waitlisting primary user due to capacity limit');
          } else {
            throw new Error(capacityCheck.message || 'Event is at capacity. Cannot change status to "going".');
          }
        } else {
          throw new Error(capacityCheck.message || 'Event is at capacity. Cannot change status to "going".');
        }
      }
    } else {
      // For family members, allow them to join as "going" even when event is full
      // This allows the primary user to bring family members to a full event
      console.log('DEBUG: Allowing family member to join as "going" despite capacity limit');
    }
  }
  
  const updatePayload = {
    ...updateData,
    updatedAt: new Date()
  };
  console.log('DEBUG: updateAttendee payload:', updatePayload);
  
  await updateDoc(attendeeRef, updatePayload);
  console.log('DEBUG: updateAttendee completed successfully');
  
  // If primary member status changed, cascade to family members
  if (isPrimaryMember && isStatusChange && updateData.rsvpStatus) {
    console.log('DEBUG: Primary member status changed, cascading to family members');
    await cascadePrimaryStatusChange(eventId, attendeeData.userId, updateData.rsvpStatus);
  }
};

// Delete attendee
export const deleteAttendee = async (eventId: string, attendeeId: string): Promise<void> => {
  const attendeeRef = doc(db, 'events', eventId, 'attendees', attendeeId);
  await deleteDoc(attendeeRef);
};

// Get all attendees for an event (for current user only)
export const listAttendees = async (eventId: string, userId: string): Promise<Attendee[]> => {
  console.log('🔍 listAttendees called with:', { eventId, userId });
  
  const attendeesRef = collection(db, 'events', eventId, 'attendees');
  const q = query(
    attendeesRef, 
    where('userId', '==', userId),
    orderBy('createdAt', 'asc')
  );
  const snapshot = await getDocs(q);
  
  const attendees = snapshot.docs.map(doc => ({
    attendeeId: doc.id,
    ...doc.data()
  })) as Attendee[];
  
  console.log('🔍 listAttendees result:', { 
    eventId, 
    userId, 
    attendeeCount: attendees.length, 
    attendeeNames: attendees.map(a => a.name) 
  });
  
  return attendees;
};

// Get all attendees for an event (all users) - for admin view
export const listAllAttendees = async (eventId: string): Promise<Attendee[]> => {
  console.log('🔍 listAllAttendees called for eventId:', eventId);
  
  const attendeesRef = collection(db, 'events', eventId, 'attendees');
  const q = query(attendeesRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);
  
  const attendees = snapshot.docs.map(doc => ({
    attendeeId: doc.id,
    ...doc.data()
  })) as Attendee[];
  
  console.log('🔍 listAllAttendees result:', { 
    eventId, 
    attendeeCount: attendees.length, 
    attendeeNames: attendees.map(a => a.name) 
  });
  
  return attendees;
};

// Get attendees by user for an event
export const getUserAttendees = async (eventId: string, userId: string): Promise<Attendee[]> => {
  const attendeesRef = collection(db, 'events', eventId, 'attendees');
  const q = query(
    attendeesRef, 
    where('userId', '==', userId),
    orderBy('createdAt', 'asc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    attendeeId: doc.id,
    ...doc.data()
  })) as Attendee[];
};

// Get total attendee count for an event (all users)
export const getEventAttendeeCount = async (eventId: string): Promise<number> => {
  console.log('🔍 DEBUG: getEventAttendeeCount called for eventId:', eventId);
  
  try {
    const attendeesRef = collection(db, 'events', eventId, 'attendees');
    const q = query(attendeesRef, orderBy('createdAt', 'asc'));
    const snapshot = await getDocs(q);
    
    // Filter to only count attendees with 'going' status
    const goingAttendees = snapshot.docs.filter(doc => {
      const data = doc.data();
      return data.rsvpStatus === 'going';
    });
    
    console.log('🔍 DEBUG: getEventAttendeeCount result:', goingAttendees.length, 'going attendees out of', snapshot.docs.length, 'total attendees');
    return goingAttendees.length;
  } catch (error) {
    console.warn('⚠️ Failed to fetch total attendee count:', error);
    // Return 0 if we can't fetch the count (e.g., private event or permission denied)
    return 0;
  }
};

// Bulk upsert attendees (for family members)
export const bulkUpsertAttendees = async (eventId: string, attendees: CreateAttendeeData[]): Promise<string[]> => {
  // Count how many 'going' attendees we're trying to add
  const goingAttendeesCount = attendees.filter(a => a.rsvpStatus === 'going').length;
  
  // Check capacity only if we have 'going' attendees
  if (goingAttendeesCount > 0) {
    const capacityCheck = await checkEventCapacity(eventId, goingAttendeesCount);
    if (!capacityCheck.canAdd) {
      throw new Error(capacityCheck.message || 'Event capacity exceeded');
    }
  }

  const batch = writeBatch(db);
  const attendeeIds: string[] = [];

  attendees.forEach(attendeeData => {
    const attendeeId = generateAttendeeId();
    const attendee: Attendee = {
      attendeeId,
      ...attendeeData,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const attendeeRef = doc(db, 'events', eventId, 'attendees', attendeeId);
    batch.set(attendeeRef, attendee);
    attendeeIds.push(attendeeId);
  });

  await batch.commit();
  return attendeeIds;
};

// Set attendee status
export const setAttendeeStatus = async (
  eventId: string,
  attendeeId: string,
  status: AttendeeStatus
): Promise<void> => {
  console.log('🔍 DEBUG: setAttendeeStatus called:', { eventId, attendeeId, status });
  console.log('🔍 DEBUG: Document path will be: events/' + eventId + '/attendees/' + attendeeId);
  await updateAttendee(eventId, attendeeId, { rsvpStatus: status });
  console.log('🔍 DEBUG: setAttendeeStatus completed successfully');
  console.log('🔍 DEBUG: Cloud Function should have been triggered for path: events/' + eventId + '/attendees/' + attendeeId);
};

// Calculate attendee counts for an event
export const calculateAttendeeCounts = (attendees: Attendee[]): AttendeeCounts => {
  const counts: AttendeeCounts = {
    goingCount: 0,
    notGoingCount: 0,
    pendingCount: 0,
    waitlistedCount: 0,
    totalGoingByAgeGroup: {
      '0-2': 0,
      '3-5': 0,
      '6-10': 0,
      '11+': 0,
      'adult': 0
    },
    totalGoing: 0
  };

  attendees.forEach(attendee => {
    switch (attendee.rsvpStatus) {
      case 'going':
        counts.goingCount++;
        counts.totalGoing++;
        counts.totalGoingByAgeGroup[attendee.ageGroup]++;
        break;
      case 'not-going':
        counts.notGoingCount++;
        break;
      case 'pending':
        counts.pendingCount++;
        break;
      case 'waitlisted':
        counts.waitlistedCount++;
        break;
    }
  });

  return counts;
};

// Get waitlist position for a specific user
export const getWaitlistPosition = async (eventId: string, userId: string): Promise<number | null> => {
  try {
    const attendeesRef = collection(db, 'events', eventId, 'attendees');
    const waitlistQuery = query(
      attendeesRef, 
      where('rsvpStatus', '==', 'waitlisted'),
      orderBy('createdAt', 'asc') // First come, first served
    );
    
    const waitlistSnapshot = await getDocs(waitlistQuery);
    const waitlistedAttendees = waitlistSnapshot.docs.map(doc => doc.data());
    
    // Find the user's position (1-based)
    const userPosition = waitlistedAttendees.findIndex(attendee => attendee.userId === userId);
    
    return userPosition >= 0 ? userPosition + 1 : null; // Return 1-based position or null if not found
  } catch (error) {
    // If index is missing, return null gracefully (position will be calculated after index is created)
    if (error instanceof Error && error.message.includes('requires an index')) {
      console.warn('Firestore index for waitlist position is being created. Position will be available shortly.');
      return null;
    }
    console.error('Error getting waitlist position:', error);
    return null;
  }
};

// Recompute event attendee count (for cloud functions)
export const recomputeEventAttendeeCount = async (eventId: string): Promise<number> => {
  // For cloud functions, we need to get ALL attendees for the event
  const attendeesRef = collection(db, 'events', eventId, 'attendees');
  const q = query(attendeesRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);
  const attendees = snapshot.docs.map(doc => ({
    attendeeId: doc.id,
    ...doc.data()
  })) as Attendee[];
  
  const counts = calculateAttendeeCounts(attendees);
  return counts.totalGoing;
};

// Real-time listener for attendees (current user only)
export const subscribeToAttendees = (
  eventId: string, 
  userId: string,
  callback: (attendees: Attendee[]) => void
): (() => void) => {
  const attendeesRef = collection(db, 'events', eventId, 'attendees');
  const q = query(
    attendeesRef, 
    where('userId', '==', userId),
    orderBy('createdAt', 'asc')
  );
  
  const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
    const attendees = snapshot.docs.map(doc => ({
      attendeeId: doc.id,
      ...doc.data()
    })) as Attendee[];
    
    callback(attendees);
  });
  
  return unsubscribe;
};

// Real-time listener for all attendees (admin view)
export const subscribeToAllAttendees = (
  eventId: string,
  callback: (attendees: Attendee[]) => void
): (() => void) => {
  const attendeesRef = collection(db, 'events', eventId, 'attendees');
  const q = query(attendeesRef, orderBy('createdAt', 'asc'));
  
  const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
    const attendees = snapshot.docs.map(doc => ({
      attendeeId: doc.id,
      ...doc.data()
    })) as Attendee[];
    
    callback(attendees);
  });
  
  return unsubscribe;
};

// Get attendees by status
export const getAttendeesByStatus = async (
  eventId: string, 
  userId: string,
  status: AttendeeStatus
): Promise<Attendee[]> => {
  const attendeesRef = collection(db, 'events', eventId, 'attendees');
  const q = query(
    attendeesRef, 
    where('userId', '==', userId),
    where('rsvpStatus', '==', status),
    orderBy('createdAt', 'asc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    attendeeId: doc.id,
    ...doc.data()
  })) as Attendee[];
};

// Search attendees by name
export const searchAttendees = async (eventId: string, userId: string, searchTerm: string): Promise<Attendee[]> => {
  const attendees = await listAttendees(eventId, userId);
  const term = searchTerm.toLowerCase();
  
  return attendees.filter(attendee => 
    attendee.name.toLowerCase().includes(term) ||
    attendee.relationship.toLowerCase().includes(term)
  );
};
