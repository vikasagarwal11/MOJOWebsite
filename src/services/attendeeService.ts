import { 
  collection, 
  doc, 
  getDocs, 
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
  AttendeeStatus,
  AgeGroup,
  BulkAttendeeOperation
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

// Create or update a single attendee
export const upsertAttendee = async (attendeeData: CreateAttendeeData): Promise<string> => {
  const validation = validateAttendee(attendeeData);
  if (!validation.isValid) {
    throw new Error(`Invalid attendee data: ${validation.errors.join(', ')}`);
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

// Update existing attendee
export const updateAttendee = async (
  eventId: string, 
  attendeeId: string, 
  updateData: UpdateAttendeeData
): Promise<void> => {
  console.log('DEBUG: updateAttendee service called with:', { eventId, attendeeId, updateData });
  const attendeeRef = doc(db, 'events', eventId, 'attendees', attendeeId);
  
  const updatePayload = {
    ...updateData,
    updatedAt: new Date()
  };
  console.log('DEBUG: updateAttendee payload:', updatePayload);
  
  await updateDoc(attendeeRef, updatePayload);
  console.log('DEBUG: updateAttendee completed successfully');
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
    totalGoingByAgeGroup: {
      '0-2': 0,
      '3-5': 0,
      '6-10': 0,
      '11+': 0
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
    }
  });

  return counts;
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
