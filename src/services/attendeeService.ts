import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  updateDoc, 
  query, 
  where, 
  orderBy, 
  writeBatch,
  runTransaction,
  onSnapshot,
  DocumentData,
  serverTimestamp,
  limit,
  startAfter
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { AttendeeStatus } from '../types/attendee';
import type { Attendee, CreateAttendeeData, UpdateAttendeeData, AttendeeCounts } from '../types/attendee';
import { sanitizeFirebaseData, safeStringConversion } from '../utils/dataSanitizer';
import type { DocumentReference, Transaction } from 'firebase/firestore';
import { CapacityError, PermissionError } from '../errors';

const getAttendingDelta = (
  previousStatus: AttendeeStatus | null | undefined,
  nextStatus: AttendeeStatus
): number => {
  const wasGoing = previousStatus === 'going';
  const isGoing = nextStatus === 'going';

  if (isGoing && !wasGoing) return 1;
  if (!isGoing && wasGoing) return -1;
  return 0;
};

const updateEventAttendingCount = async (
  transaction: Transaction,
  eventRef: DocumentReference,
  delta: number
) => {
  if (delta === 0) return;

  const eventSnap = await transaction.get(eventRef);
  if (!eventSnap.exists()) return;

  const currentCount = Number(eventSnap.data()?.attendingCount || 0);
  const newCount = Math.max(0, currentCount + delta);

  transaction.update(eventRef, {
    attendingCount: newCount,
    updatedAt: serverTimestamp()
  });
};

// Create attendee
export const createAttendee = async (
  eventId: string, 
  attendeeData: CreateAttendeeData
): Promise<string> => {
  console.log('dY"? DEBUG: createAttendee called with:', { eventId, attendeeData });
  
  // Validate required fields
  if (!eventId || !attendeeData.userId || !attendeeData.attendeeType || !attendeeData.rsvpStatus) {
    throw new Error('Missing required fields for attendee creation');
  }
  
  // Clean the data to ensure no undefined values and proper string handling
  const cleanedData = {
    eventId: safeStringConversion(eventId).trim(),
    userId: safeStringConversion(attendeeData.userId).trim(),
    attendeeType: attendeeData.attendeeType,
    relationship: attendeeData.relationship || 'self',
    name: safeStringConversion(attendeeData.name || 'Unknown').trim(),
    ageGroup: attendeeData.ageGroup || 'adult',
    rsvpStatus: attendeeData.rsvpStatus,
    familyMemberId: attendeeData.familyMemberId || null
  };
  
  console.log('dY"? DEBUG: Cleaned attendee data:', cleanedData);
  
  const attendeesRef = collection(db, 'events', eventId, 'attendees');
  const eventRef = doc(db, 'events', eventId);
  const newAttendeeRef = doc(attendeesRef);
  const newAttendee = {
    ...cleanedData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  console.log('dY"? DEBUG: Final attendee document:', newAttendee);

  try {
    await runTransaction(db, async (transaction) => {
      // CRITICAL: All reads must happen before all writes in Firestore transactions
      // Read the event document first to get current attendingCount
      const eventSnap = await transaction.get(eventRef);
      const currentCount = eventSnap.exists() ? Number(eventSnap.data()?.attendingCount || 0) : 0;

      // Calculate the delta and new count
      const delta = getAttendingDelta(null, cleanedData.rsvpStatus);
      const newCount = Math.max(0, currentCount + delta);

      // Now perform all writes (attendee creation and event update)
      transaction.set(newAttendeeRef, newAttendee);

      if (delta !== 0) {
        transaction.update(eventRef, {
          attendingCount: newCount,
          updatedAt: serverTimestamp()
        });
      }
    });

    console.log('dY"? DEBUG: Attendee created successfully with ID:', newAttendeeRef.id);
    return newAttendeeRef.id;
  } catch (error) {
    console.error('DEBUG: Failed to create attendee:', error);
    throw error instanceof Error ? error : new Error('Failed to create attendee');
  }
};

// Calculate attendee counts from an array of attendees (used in hooks)
export const calculateAttendeeCounts = (attendees: Attendee[]): AttendeeCounts => {
  const counts: AttendeeCounts = {
    goingCount: 0,
    notGoingCount: 0,
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
        if (attendee.ageGroup && counts.totalGoingByAgeGroup[attendee.ageGroup] !== undefined) {
          counts.totalGoingByAgeGroup[attendee.ageGroup]++;
        }
        break;
      case 'not-going':
        counts.notGoingCount++;
        break;
      case 'waitlisted':
        counts.waitlistedCount++;
        break;
      default:
        // Handle any invalid or legacy status values gracefully
        // Note: 'pending' status is not in current AttendeeStatus type, so we ignore it
        break;
    }
  });

  return counts;
};

// Calculate attendee counts for an event by querying Firestore (used in functions)
export const calculateAttendeeCountsFromEvent = async (eventId: string): Promise<{
  totalGoing: number;
  totalWaitlisted: number;
  totalNotGoing: number;
}> => {
  const attendeesRef = collection(db, 'events', eventId, 'attendees');
  const snapshot = await getDocs(attendeesRef);
  
  const counts = {
    totalGoing: 0,
    totalWaitlisted: 0,
    totalNotGoing: 0
  };
  
  snapshot.docs.forEach(doc => {
    const status = doc.data().rsvpStatus as AttendeeStatus;
    if (status === 'going') counts.totalGoing++;
    else if (status === 'waitlisted') counts.totalWaitlisted++;
    else if (status === 'not-going') counts.totalNotGoing++;
  });

  return counts;
};

// Enhanced waitlist position management with proper persistence
export const manageWaitlistPosition = async (
  eventId: string, 
  userId: string, 
  newRsvpStatus: AttendeeStatus
): Promise<{
  success: boolean;
  position?: number | null;
  promoted?: boolean;
  spotsNeeded?: number;
  message?: string;
  error?: string;
}> => {
  try {
    const { effectiveCapacity, totalGoing } = await calculateEffectiveCapacity(eventId);
    const availableSpots = effectiveCapacity - totalGoing;
    
    // Find current attendee record
    const attendeesRef = collection(db, 'events', eventId, 'attendees');
    const attendeeQuery = query(attendeesRef, where('userId', '==', userId));
    const attendeeSnapshot = await getDocs(attendeeQuery);
    
    if (attendeeSnapshot.empty) {
      return { success: false, error: 'Attendee not found' };
    }
    
    const docs = attendeeSnapshot.docs;
    const primaryDoc = docs.find(d => (d.data() as any).attendeeType === 'primary') || docs[0];
    const attendeeDoc = primaryDoc;
    const currentData = attendeeDoc.data();
    const currentStatus = currentData.rsvpStatus;
    const currentPosition = currentData.waitlistPosition;
    
    // Handle different status transitions
    if (newRsvpStatus === 'waitlisted') {
      return await handleWaitlistJoin(eventId, userId, availableSpots, currentData, attendeeDoc.id);
    } else if (currentStatus === 'waitlisted' && (newRsvpStatus === 'going' || newRsvpStatus === 'not-going')) {
      return await handleWaitlistLeave(eventId, userId, currentPosition, attendeeDoc.id);
    } else {
      // Status change not involving waitlist - just update
      await updateDoc(doc(db, 'events', eventId, 'attendees', attendeeDoc.id), {
        rsvpStatus: newRsvpStatus,
        waitlistPosition: null, // Clear position if leaving waitlist
        promotedAt: newRsvpStatus === 'going' ? serverTimestamp() : null,
        updatedAt: serverTimestamp()
      });
      
      return { success: true, message: `Status updated to ${newRsvpStatus}` };
    }
  } catch (error) {
    console.error('Error managing waitlist position:', error);
    return { success: false, error: 'Failed to manage waitlist position' };
  }
};

// Calculate priority position based on membership tier
const calculatePriorityPosition = async (
  userId: string,
  proposedPosition: number
): Promise<number> => {
  try {
    // Get user's membership tier
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return proposedPosition;
    }
    
    const userData = userDoc.data();
    const membershipTier = userData?.membershipTier || 'free';
    
    console.log(`ðŸ” VIP Priority Check for user ${userId}:`, {
      membershipTier,
      proposedPosition,
      hasTierData: !!userData?.membershipTier
    });
    
    // Calculate position based on tier
    switch(membershipTier) {
      case 'vip':
        // VIPs bypass waitlist entirely for most events
        const vipPosition = proposedPosition === -1 ? 1 : Math.floor(proposedPosition * 0.1);
        console.log(`ðŸš€ VIP ${userId}: ${proposedPosition} -> ${vipPosition}`);
        return vipPosition;
      case 'premium':
        // Premium gets 70% position boost
        const premiumPosition = Math.max(1, Math.floor(proposedPosition * 0.3));
        console.log(`â­ PREMIUM ${userId}: ${proposedPosition} -> ${premiumPosition}`);
        return premiumPosition;
      case 'basic':
        // Basic gets 30% position boost
        

    const basicPosition = Math.max(1, Math.floor(proposedPosition * 0.7));
        console.log(`âœ¨ BASIC ${userId}: ${proposedPosition} -> ${basicPosition}`);
        return basicPosition;
      case 'free':
      default:
        // Free tier gets normal position
        const freePosition = proposedPosition;
        console.log(`ðŸ†“ FREE ${userId}: ${proposedPosition} -> ${freePosition}`); 
        return freePosition;
    }
  } catch (error) {
    console.error('Error calculating priority position:', error);
    return proposedPosition; // Fallback unchanged
  }
};

// Handle when someone joins the waitlist - ATOMIC TRANSACTION
const handleWaitlistJoin = async (
  eventId: string, 
  userId: string, 
  availableSpots: number,
  currentData: any,
  attendeeDocId: string
): Promise<{
  success: boolean;
  position: number | null;
  promoted: boolean;
  message: string;
  error?: string;
}> => {
  try {
    const result = await runTransaction(db, async (transaction) => {
      // âš¡ ATOMIC: Get all waitlisted attendees within transaction
    const waitlistQuery = query(
        collection(db, 'events', eventId, 'attendees'),
      where('rsvpStatus', '==', 'waitlisted'),
        orderBy('waitlistPosition', 'asc') // Sort by current position
    );
    
    const waitlistSnapshot = await getDocs(waitlistQuery);
      
      // ðŸ”’ LOCK: Calculate priority-based position atomically
      // Find the next available position by checking existing positions
      const existingPositions = waitlistSnapshot.docs
        .map(doc => doc.data().waitlistPosition)
        .filter(pos => pos !== null && pos !== undefined)
        .sort((a, b) => a - b);
      
      let proposedPosition = 1;
      for (let i = 0; i < existingPositions.length; i++) {
        if (existingPositions[i] === proposedPosition) {
          proposedPosition++;
        } else {
          break;
        }
      }
      
      console.log(`ðŸŽ¯ PRE-WAITLIST JOIN: Calculating priority for user ${userId}, proposed position: ${proposedPosition}`);
      const priorityPosition = await calculatePriorityPosition(userId, proposedPosition);
      console.log(`ðŸŽ¯ POST-WAITLIST JOIN: Final priority position for user ${userId}: ${priorityPosition}`);
      
      // âš¡ ATOMIC: Check if position already exists (double-check)
      const existingPositionQuery = query(
        collection(db, 'events', eventId, 'attendees'),
        where('rsvpStatus', '==', 'waitlisted')
      );
      
      const existingSnapshot = await getDocs(existingPositionQuery);
      let finalPosition = priorityPosition;
      
      // Double-check for position collision and find next available
      const allExistingPositions = existingSnapshot.docs
        .map(doc => doc.data().waitlistPosition)
        .filter(pos => pos !== null && pos !== undefined);
      
      while (allExistingPositions.includes(finalPosition)) {
        finalPosition++;
      }
      
      // ðŸ”’ ATOMIC UPDATE: Assign position within transaction
      const attendeeRef = doc(db, 'events', eventId, 'attendees', attendeeDocId);
      
      const updateData: any = {
        rsvpStatus: 'waitlisted',
        waitlistPosition: finalPosition,
        waitlistJoinedAt: serverTimestamp(),
        originalWaitlistJoinedAt: currentData.originalWaitlistJoinedAt || serverTimestamp(), // Preserve original join time
        updatedAt: serverTimestamp()
      };
      
      transaction.update(attendeeRef, updateData);
      
      return {
        assignedPosition: finalPosition,
        totalWaitlisted: waitlistSnapshot.size + 1,
        message: `Joined waitlist at position ${finalPosition}`
      };
    });
    
    console.log(`âœ… ATOMIC WAITLIST JOIN successful:`, result);
    return {
      success: true,
      position: result.assignedPosition,
      promoted: false,
      message: result.message
    };
  } catch (error) {
    console.error('ðŸš¨ ATOMIC WAITLIST JOIN FAILED:', error);
    
    // Retry logic for transaction conflicts
    if (error instanceof Error && error.name.includes('transaction')) {
      console.log('ðŸ”„ Retrying waitlist join due to transaction conflict...');
      
      // Wait a bit and retry ONCE
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
      
      try {
        return await handleWaitlistJoin(eventId, userId, availableSpots, currentData, attendeeDocId);
      } catch (retryError) {
        return {
          success: false,
          position: null,
          promoted: false,
          message: 'Failed to join waitlist after retry. Please try again.',
          error: 'Failed to join waitlist after retry. Please try again.'
        };
      }
    }
    
    return {
      success: false,
      position: null,
      promoted: false,
      message: 'Failed to join waitlist. Please try again.',
      error: 'Failed to join waitlist. Please try again.'
    };
  }
};

// Handle when someone leaves the waitlist - ATOMIC TRANSACTION
const handleWaitlistLeave = async (
  eventId: string, 
  userId: string,
  currentPosition: number | null,
  attendeeDocId: string
): Promise<{
  success: boolean;
  promoted: boolean;
  message: string;
  error?: string;
}> => {
  try {
    const result = await runTransaction(db, async (transaction) => {
      // âš¡ ATOMIC: Remove user from waitlist and recalculate positions
      const attendeeRef = doc(db, 'events', eventId, 'attendees', attendeeDocId);
      
      // Clear user's position
      transaction.update(attendeeRef, {
        waitlistPosition: null,
        updatedAt: serverTimestamp()
      });
      
      // ðŸ”’ ATOMIC: Get remaining waitlisted attendees
      const waitlistQuery = query(
        collection(db, 'events', eventId, 'attendees'),
        where('rsvpStatus', '==', 'waitlisted')
      );
      
      const waitlistSnapshot = await getDocs(waitlistQuery);
      
      // ðŸ”„ ATOMIC: Reassign sequential positions
      let newPosition = 1;
      waitlistSnapshot.docs.forEach(doc => {
        const docRef = doc.ref;
        transaction.update(docRef, {
          waitlistPosition: newPosition,
          updatedAt: serverTimestamp()
        });
        newPosition++;
      });
      
      return {
        removedPosition: currentPosition,
        newTotalCount: newPosition - 1,
        message: `Removed from position ${currentPosition}. Recalculated ${newPosition - 1} remaining positions.`
      };
    });
    
    // ðŸš€ TRIGGER AUTO-PROMOTION after someone leaves
    console.log(`ðŸ”„ Triggering auto-promotion for event: ${eventId}`);
    
    // Auto-promotion will be handled by Cloud Function trigger
    // For now, just log that auto-promotion should happen
    const promoMessage = `User ${userId} left waitlist position ${currentPosition} - Cloud Function will trigger auto-promotion`;
    console.log(`ðŸš€ ${promoMessage}`);
    
    return { 
      success: true, 
      promoted: false, // Will be handled by Cloud Function
      message: `${result.message} ðŸš€ ${promoMessage}`
    };
  } catch (error) {
    console.error('ðŸš¨ ATOMIC WAITLIST LEAVE FAILED:', error);
    
    // Retry logic for transaction conflicts
    if (error instanceof Error && error.message.includes('transaction')) {
      console.log('ðŸ”„ Retrying waitlist leave due to transaction conflict...');
      
      // Wait a bit and retry ONCE
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
      
      try {
        return await handleWaitlistLeave(eventId, userId, currentPosition, attendeeDocId);
      } catch (retryError) {
        return {
          success: false,
          promoted: false,
          message: 'Failed to leave waitlist after retry. Please try again.',
          error: 'Failed to leave waitlist after retry. Please try again.'
        };
      }
    }
    
    return {
      success: false,
      promoted: false,
      message: 'Failed to leave waitlist. Please try again.',
      error: 'Failed to leave waitlist. Please try again.'
    };
  }
};

// Auto-promotion is handled by Cloud Functions via onDocumentWritten trigger

// Calculate effective capacity and going count
export const calculateEffectiveCapacity = async (eventId: string): Promise<{
  effectiveCapacity: number;
  totalGoing: number;
  eventCapacityExceeded: boolean;
}> => {
  try {
    // Get event details
    const eventRef = doc(db, 'events', eventId);
    const eventDoc = await getDoc(eventRef);
    
    if (!eventDoc.exists()) {
      throw new Error('Event not found');
    }
    
    const eventData = eventDoc.data();
    const maxAttendees = eventData.maxAttendees || 0;
    
    // Count current attendees with "going" status
  const attendeesRef = collection(db, 'events', eventId, 'attendees');
    const goingQuery = query(attendeesRef, where('rsvpStatus', '==', 'going'));
    const goingSnapshot = await getDocs(goingQuery);
    
    const totalGoing = goingSnapshot.size;
    const eventCapacityExceeded = totalGoing >= maxAttendees;
    
    return {
      effectiveCapacity: maxAttendees,
      totalGoing,
      eventCapacityExceeded
    };
  } catch (error) {
    console.error('Error calculating effective capacity:', error);
    return {
      effectiveCapacity: 0,
      totalGoing: 0,
      eventCapacityExceeded: false
    };
  }
};

// Check event capacity
export const checkEventCapacity = async (eventId: string, additionalCount: number = 0): Promise<{
  canAdd: boolean;
  currentCount: number;
  maxCapacity: number;
  message?: string;
}> => {
  try {
    const { effectiveCapacity, totalGoing } = await calculateEffectiveCapacity(eventId);
    const newTotal = totalGoing + additionalCount;
    
    const canAdd = newTotal <= effectiveCapacity;
    const message = canAdd 
      ? undefined 
      : `Cannot add ${additionalCount} attendee(s). Event capacity would be exceeded. Current: ${totalGoing}/${effectiveCapacity}`;
    
    return {
      canAdd,
      currentCount: totalGoing,
      maxCapacity: effectiveCapacity,
      message
    };
  } catch (error) {
    console.error('Error checking event capacity:', error);
    return {
      canAdd: false,
      currentCount: 0,
      maxCapacity: 0,
      message: 'Error checking capacity'
    };
  }
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
  const attendees: Attendee[] = [];
  
  snapshot.forEach(doc => {
    try {
      const data = doc.data();
      
      // Safely convert timestamps
      let createdAt: Date | undefined;
      let updatedAt: Date | undefined;
      
      try {
        if (data.createdAt && typeof data.createdAt.toDate === 'function') {
          createdAt = data.createdAt.toDate();
        }
      } catch (e) {
        console.warn('⚠️ Error converting createdAt timestamp:', e);
      }
      
      try {
        if (data.updatedAt && typeof data.updatedAt.toDate === 'function') {
          updatedAt = data.updatedAt.toDate();
        }
      } catch (e) {
        console.warn('⚠️ Error converting updatedAt timestamp:', e);
      }
      
      attendees.push({
        attendeeId: doc.id,
        ...data,
        createdAt,
        updatedAt
      } as Attendee);
    } catch (error) {
      console.error(`❌ Error processing attendee ${doc.id}:`, error);
      // Continue processing other attendees even if one fails
    }
  });
  
  console.log('🔍 listAttendees returning:', { count: attendees.length, attendees });
  return attendees;
};

// List all attendees for an event (all users) - for admin view
export const listAllAttendees = async (eventId: string): Promise<Attendee[]> => {
  console.log('🔍 listAllAttendees called for eventId:', eventId);
  
  const attendeesRef = collection(db, 'events', eventId, 'attendees');
  const q = query(attendeesRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);
  
  const attendees: Attendee[] = [];
  
  snapshot.forEach(doc => {
    try {
      const data = doc.data();
      
      // Safely convert timestamps
      let createdAt: Date | undefined;
      let updatedAt: Date | undefined;
      
      try {
        if (data.createdAt && typeof data.createdAt.toDate === 'function') {
          createdAt = data.createdAt.toDate();
        }
      } catch (e) {
        console.warn('⚠️ Error converting createdAt timestamp:', e);
      }
      
      try {
        if (data.updatedAt && typeof data.updatedAt.toDate === 'function') {
          updatedAt = data.updatedAt.toDate();
        }
      } catch (e) {
        console.warn('⚠️ Error converting updatedAt timestamp:', e);
      }
      
      attendees.push({
        attendeeId: doc.id,
        ...data,
        createdAt,
        updatedAt
      } as Attendee);
    } catch (error) {
      console.error(`❌ Error processing attendee ${doc.id}:`, error);
      // Continue processing other attendees even if one fails
    }
  });
  
  console.log('🔍 listAllAttendees result:', { 
    eventId, 
    attendeeCount: attendees.length
  });
  
  return attendees;
};

// Subscribe to attendees for a specific user
export const subscribeToAttendees = (
  eventId: string,
  userId: string,
  callback: (attendees: Attendee[]) => void
): (() => void) => {
  const attendeesRef = collection(db, 'events', eventId, 'attendees');
  const q = query(attendeesRef, where('userId', '==', userId));
  
  return onSnapshot(q, (snapshot) => {
    try {
      console.log('subscribeToAttendees: Received snapshot with', snapshot.docs.length, 'docs for user:', userId);
      const attendees = snapshot.docs
        .map((doc) => ({
          attendeeId: doc.id,
          id: doc.id,
          ...sanitizeFirebaseData(doc.data())
        } as unknown as Attendee))
        .filter(Boolean) as Attendee[];
      if (typeof callback === 'function') {
        callback(attendees);
      } else {
        console.error('subscribeToAttendees: callback is not a function:', typeof callback, callback);
      }
    } catch (error) {
      console.error('subscribeToAttendees: Error in snapshot handler:', error);
    }
  });
};

// Subscribe to all attendees for an event (admin only)
export const subscribeToAllAttendees = (
  eventId: string,
  callback: (attendees: Attendee[]) => void
): (() => void) => {
  const attendeesRef = collection(db, 'events', eventId, 'attendees');
  
  return onSnapshot(attendeesRef, (snapshot) => {
    try {
      console.log('subscribeToAllAttendees: Received snapshot with', snapshot.docs.length, 'docs');
      const attendees = snapshot.docs
        .map((doc) => ({
          attendeeId: doc.id,
          id: doc.id,
          ...sanitizeFirebaseData(doc.data())
        } as unknown as Attendee))
        .filter(Boolean) as Attendee[];
      if (typeof callback === 'function') {
        callback(attendees);
      } else {
        console.error('subscribeToAllAttendees: callback is not a function:', typeof callback, callback);
      }
    } catch (error) {
      console.error('subscribeToAllAttendees: Error in snapshot handler:', error);
    }
  });
};

// Get user attendees (alias for listAttendees)
export const getAttendeesByUserId = listAttendees;

// Get user attendees (alias)
export const getUserAttendees = getAttendeesByUserId;

// Bulk upsert attendees
export const bulkUpsertAttendees = async (
  eventId: string,
  attendeesData: (CreateAttendeeData | UpdateAttendeeData)[]
): Promise<string[]> => {
  const batch = writeBatch(db);
  const attendeeIds: string[] = [];
  const eventRef = doc(db, 'events', eventId);
  let goingDelta = 0;

  for (const attendeeData of attendeesData) {
    const attendeeRef = doc(collection(db, 'events', eventId, 'attendees'));
    const payload = {
      ...attendeeData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    batch.set(attendeeRef, payload);
    attendeeIds.push(attendeeRef.id);

    if ((attendeeData as CreateAttendeeData).rsvpStatus === 'going') {
      goingDelta += 1;
    }
  }
  await batch.commit();

  if (goingDelta !== 0) {
    await runTransaction(db, async (transaction) => {
      await updateEventAttendingCount(transaction, eventRef, goingDelta);
    });
  }

  return attendeeIds;
};

// Delete attendee
export const deleteAttendee = async (
  eventId: string,
  attendeeId: string
): Promise<void> => {
  const attendeeRef = doc(db, 'events', eventId, 'attendees', attendeeId);
  const eventRef = doc(db, 'events', eventId);

  await runTransaction(db, async (transaction) => {
    const attendeeSnap = await transaction.get(attendeeRef);
    if (!attendeeSnap.exists()) {
      return;
    }

    const attendeeData = attendeeSnap.data() as Attendee;
    transaction.delete(attendeeRef);

    if (attendeeData.rsvpStatus === 'going') {
      await updateEventAttendingCount(transaction, eventRef, -1);
    }
  });
};

// Set attendee status
export const setAttendeeStatus = async (
  eventId: string,
  attendeeId: string,
  status: AttendeeStatus
): Promise<void> => {
  await updateAttendee(eventId, attendeeId, { rsvpStatus: status });
};

// Update attendee
export const updateAttendee = async (
  eventId: string,
  attendeeId: string,
  updateData: UpdateAttendeeData
): Promise<void> => {
  const attendeeRef = doc(db, 'events', eventId, 'attendees', attendeeId);
  const eventRef = doc(db, 'events', eventId);

  const initialSnap = await getDoc(attendeeRef);
  if (!initialSnap.exists()) {
    throw new Error('Attendee not found');
  }

  const initialData = initialSnap.data() as Attendee;
  const initialStatus = initialData.rsvpStatus as AttendeeStatus;
  const targetStatus = (updateData.rsvpStatus ?? initialStatus) as AttendeeStatus;

  try {
    await runTransaction(db, async (transaction) => {
      // CRITICAL: All reads must happen before all writes in Firestore transactions
      // Read both attendee and event documents first
      const attendeeSnap = await transaction.get(attendeeRef);
      if (!attendeeSnap.exists()) {
        throw new Error('Attendee not found');
      }

      const currentData = attendeeSnap.data() as Attendee;
      const currentStatus = currentData.rsvpStatus as AttendeeStatus;
      const nextStatus = (updateData.rsvpStatus ?? currentStatus) as AttendeeStatus;
      const delta = getAttendingDelta(currentStatus, nextStatus);

      // Read event document if we need to update attending count
      let currentCount = 0;
      if (delta !== 0) {
        const eventSnap = await transaction.get(eventRef);
        if (eventSnap.exists()) {
          currentCount = Number(eventSnap.data()?.attendingCount || 0);
        }
      }

      // Now perform all writes (attendee update and event update)
      transaction.update(attendeeRef, {
        ...updateData,
        updatedAt: serverTimestamp(),
      });

      if (delta !== 0) {
        const newCount = Math.max(0, currentCount + delta);
        transaction.update(eventRef, {
          attendingCount: newCount,
          updatedAt: serverTimestamp()
        });
      }
    });
  } catch (error: any) {
    // Wrap Firestore permission errors with capacity context
    if (error?.code === 'permission-denied' && updateData.rsvpStatus === 'going') {
      try {
        const eventSnap = await getDoc(doc(db, 'events', eventId));
        
        // Existence check - if event doesn't exist, use generic permission error
        if (!eventSnap.exists()) {
          throw new PermissionError('Permission denied', 'unknown');
        }
        
        // Extract event data (concise extraction style)
        const e = eventSnap.data() || {};
        const at = e.attendingCount || 0;
        const max = e.maxAttendees || 0;
        const wlEnabled = !!e.waitlistEnabled;
        const wlLimit = e.waitlistLimit;
        const wlCount = e.waitlistCount || 0;
        const canWl = wlEnabled && (!wlLimit || wlCount < wlLimit);

        // If event is at capacity, throw CapacityError with context
        if (max && at >= max) {
          // Calculate reason for better error categorization
          let reason: 'capacity_exceeded' | 'waitlist_disabled' | 'waitlist_full' = 'capacity_exceeded';
          if (!wlEnabled) {
            reason = 'waitlist_disabled';
          } else if (wlLimit && wlCount >= wlLimit) {
            reason = 'waitlist_full';
          }
          
          const capacityError = new CapacityError(
            'Event is at capacity',
            eventId,
            at,
            max,
            wlEnabled,
            canWl,
            reason
          );
          console.log('DEBUG: Throwing CapacityError:', {
            message: capacityError.message,
            eventId,
            currentCount: at,
            maxAttendees: max,
            waitlistEnabled: wlEnabled,
            canWaitlist: canWl,
            reason,
            isCapacityError: capacityError instanceof CapacityError
          });
          throw capacityError;
        }
      } catch (eventReadError) {
        // If event read fails or event doesn't exist, fallback to generic permission error
        if (eventReadError instanceof CapacityError || eventReadError instanceof PermissionError) {
          throw eventReadError;
        }
        throw new PermissionError('Permission denied', 'unknown');
      }
    }
    
    // Handle other transaction errors
    if (error?.code === 'aborted') {
      throw new Error('Transaction conflict. Please try again.');
    }
    if (error?.code === 'unavailable') {
      throw new Error('Service temporarily unavailable. Please try again.');
    }
    
    // Re-throw other errors as-is
    throw error;
  }
};

// Upsert attendee (update or create)
export const upsertAttendee = async (
  eventId: string, 
  attendeeData: CreateAttendeeData | UpdateAttendeeData,
  attendeeId?: string
): Promise<string> => {
  if (attendeeId) {
    await updateAttendee(eventId, attendeeId, attendeeData as UpdateAttendeeData);
    return attendeeId;
  } else {
    return await createAttendee(eventId, attendeeData as CreateAttendeeData);
  }
};

// Manual recalculation function (used for admin tools or recovery)
export const manualRecalculateWaitlistPositions = async (eventId: string): Promise<{
  success: boolean;
  totalRecalculated: number;
  message: string;
}> => {
  try {
    console.log(`ðŸ”„ Manual recalculation of waitlist positions for event: ${eventId}`);
    
    const result = await runTransaction(db, async (transaction) => {
      // Get all waitlisted attendees
      const waitlistQuery = query(
        collection(db, 'events', eventId, 'attendees'),
        where('rsvpStatus', '==', 'waitlisted')
      );
      
      const waitlistSnapshot = await getDocs(waitlistQuery);
      
      // Assign new sequential positions
      let newPosition = 1;
      waitlistSnapshot.docs.forEach(doc => {
        transaction.update(doc.ref, {
          waitlistPosition: newPosition,
          updatedAt: serverTimestamp()
        });
        newPosition++;
      });
      
      return waitlistSnapshot.size;
    });
    
    return {
      success: true,
      totalRecalculated: result,
      message: `Successfully recalculated ${result} waitlist positions`
    };
  } catch (error) {
    console.error('Error manually recalculating waitlist positions:', error);
    return {
      success: false,
      totalRecalculated: 0,
      message: `Failed to recalculate positions: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

// Trigger automatic promotions (client-side stub - Cloud Function handles actual promotion)
export const triggerAutomaticPromotions = async (eventId: string): Promise<{
  success: boolean;
  promotionsCount: number;
  promotedUsers: Array<{userId: string, message: string}>;
  errors: string[];
}> => {
  // This is now handled by Cloud Functions
  console.log(`ðŸ”„ Manual trigger requested for event: ${eventId}`);
  return {
    success: true,
    promotionsCount: 0,
    promotedUsers: [],
    errors: ['Auto-promotion handled by Cloud Functions - no manual triggering needed']
  };
};

// Assign missing waitlist positions for existing attendees
export const assignMissingWaitlistPositions = async (eventId: string): Promise<{
  success: boolean;
  assignedCount: number;
  message: string;
}> => {
  try {
    console.log('ðŸ”„ Assigning missing waitlist positions for event:', eventId);
    
    // Get all waitlisted attendees first
  const attendeesRef = collection(db, 'events', eventId, 'attendees');
    const waitlistQuery = query(
    attendeesRef, 
      where('rsvpStatus', '==', 'waitlisted')
    );
    
    const waitlistSnapshot = await getDocs(waitlistQuery);
    
    console.log('ðŸ” Total waitlisted docs found:', waitlistSnapshot.docs.length);
    
    // Filter out attendees with existing positions
    const attendeesWithoutPositions = waitlistSnapshot.docs.filter(doc => {
      const data = doc.data();
      const isMissing = !data.waitlistPosition || data.waitlistPosition === null || data.waitlistPosition === undefined;
      console.log(`ðŸ” Attendee ${data.userId || doc.id}: rsvpStatus=${data.rsvpStatus}, waitlistPosition=${data.waitlistPosition}, isMissing=${isMissing}`);
      return isMissing;
    });
    
    console.log('ðŸ” Attendees without positions:', attendeesWithoutPositions.length);
    
    // Skip if no attendees need positions
    if (attendeesWithoutPositions.length === 0) {
      return {
        success: true,
        assignedCount: 0,
        message: 'No waitlisted users missing positions'
      };
    }
    
    console.log('ðŸ“ Found', attendeesWithoutPositions.length, 'waitlisted users without positions');
    
    // Get existing positions to avoid conflicts
    const existingPositionsQuery = query(
      attendeesRef,
      where('rsvpStatus', '==', 'waitlisted'),
      where('waitlistPosition', '>=', 1)
    );
    const existingSnapshot = await getDocs(existingPositionsQuery);
    
    const existingPositions = new Set();
    existingSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.waitlistPosition) {
        existingPositions.add(data.waitlistPosition);
      }
    });
    
    let nextPosition = 1;
    while (existingPositions.has(nextPosition)) {
      nextPosition++;
    }
    
    // Assign positions using batch update
    const batch = writeBatch(db);
    
    attendeesWithoutPositions.forEach((doc, index) => {
      const attendeeRef = doc.ref;
      const data = doc.data();
      
      // Skip family members - only assign to primary users
      if (data.attendeeType === 'family_member') {
        console.log('â­ï¸ Skipping family member:', data.userId);
        return;
      }
      
      batch.update(attendeeRef, {
        waitlistPosition: nextPosition + index,
        waitlistJoinedAt: data.waitlistJoinedAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });
    
    await batch.commit();
    
    const assignedCount = attendeesWithoutPositions.filter(doc => doc.data().attendeeType !== 'family_member').length;
    
    console.log('âœ… Assigned positions to', assignedCount, 'waitlisted users');
    
    return {
      success: true,
      assignedCount,
      message: `Assigned positions to ${assignedCount} waitlisted users`
    };
    
  } catch (error) {
    console.error('âŒ Error assigning waitlist positions:', error);
    return {
      success: false,
      assignedCount: 0,
      message: `Failed to assign positions: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};



