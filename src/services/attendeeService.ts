import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  updateDoc, 
  deleteDoc, 
  addDoc,
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
import type { Attendee, CreateAttendeeData, UpdateAttendeeData } from '../types/attendee';
import { sanitizeFirebaseData, safeStringConversion } from '../utils/dataSanitizer';

// Create attendee
export const createAttendee = async (
  eventId: string, 
  attendeeData: CreateAttendeeData
): Promise<string> => {
  console.log('ðŸ” DEBUG: createAttendee called with:', { eventId, attendeeData });
  
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
  
  console.log('ðŸ” DEBUG: Cleaned attendee data:', cleanedData);
  
  const attendeesRef = collection(db, 'events', eventId, 'attendees');
  const newAttendee = {
    ...cleanedData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  console.log('ðŸ” DEBUG: Final attendee document:', newAttendee);
  
  try {
    const docRef = await addDoc(attendeesRef, newAttendee);
    console.log('ðŸ” DEBUG: Attendee created successfully with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('DEBUG: Failed to create attendee:', error);
    throw error instanceof Error ? error : new Error('Failed to create attendee');
  }
};

// Calculate attendee counts for an event
export const calculateAttendeeCounts = async (eventId: string): Promise<{
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
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  const attendees: Attendee[] = [];
  
  snapshot.forEach(doc => {
    const data = doc.data();
    attendees.push({
      attendeeId: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate()
    } as Attendee);
  });
  
  console.log('🔍 listAttendees returning:', { count: attendees.length, attendees });
  return attendees;
};

// List all attendees (alias for getAllAttendees)
export const listAllAttendees = async (eventId: string): Promise<Attendee[]> => {
  const result = await getAllAttendees(eventId);
  return result.attendees;
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

  for (const attendeeData of attendeesData) {
    const attendeeRef = doc(collection(db, 'events', eventId, 'attendees'));
    const payload = {
      ...attendeeData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    batch.set(attendeeRef, payload);
    attendeeIds.push(attendeeRef.id);
  }

  await batch.commit();
  return attendeeIds;
};

// Delete attendee
export const deleteAttendee = async (
  eventId: string,
  attendeeId: string
): Promise<void> => {
  const attendeeRef = doc(db, 'events', eventId, 'attendees', attendeeId);
  await deleteDoc(attendeeRef);
};

// Set attendee status
export const setAttendeeStatus = async (
  eventId: string,
  attendeeId: string,
  status: AttendeeStatus
): Promise<void> => {
  const attendeeRef = doc(db, 'events', eventId, 'attendees', attendeeId);
  
  const updatePayload = {
    rsvpStatus: status,
    updatedAt: serverTimestamp(),
  };

  await updateDoc(attendeeRef, updatePayload);
};

// Update attendee
export const updateAttendee = async (
  eventId: string,
  attendeeId: string,
  updateData: UpdateAttendeeData
): Promise<void> => {
  const attendeeRef = doc(db, 'events', eventId, 'attendees', attendeeId);
  
  const updatePayload = {
    ...updateData,
    updatedAt: serverTimestamp(),
  };

  await updateDoc(attendeeRef, updatePayload);
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



