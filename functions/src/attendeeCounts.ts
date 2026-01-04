import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

// Firebase Admin is already initialized in index.ts

const db = admin.firestore();

// Function to recalculate and update event attendee count
export const recalculateEventAttendeeCount = async (eventId: string): Promise<number> => {
  try {
    console.log(`🔄 Recalculating attendee count for event: ${eventId}`);
    
    // Get ALL attendees first to verify counts
    const allAttendeesSnapshot = await db
      .collection('events')
      .doc(eventId)
      .collection('attendees')
      .get();
    
    // Count by status for debugging
    const statusCounts: Record<string, number> = {};
    allAttendeesSnapshot.docs.forEach(doc => {
      const status = doc.data().rsvpStatus || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    console.log(`📊 Event ${eventId} - All attendees by status:`, statusCounts);
    
    // Get only attendees with 'going' status
    const attendeesSnapshot = await db
      .collection('events')
      .doc(eventId)
      .collection('attendees')
      .where('rsvpStatus', '==', 'going')
      .get();
    
    // Count only attendees with 'going' status
    const goingCount = attendeesSnapshot.size;
    
    // Verify the count matches
    const expectedGoingCount = statusCounts['going'] || 0;
    if (goingCount !== expectedGoingCount) {
      console.warn(`⚠️ Event ${eventId} - Count mismatch! Query result: ${goingCount}, Expected: ${expectedGoingCount}`);
    }
    
    console.log(`📊 Event ${eventId}: ${goingCount} attendees going (verified: ${expectedGoingCount})`);
    
    // Update the event document with the new count
    await db
      .collection('events')
      .doc(eventId)
      .update({
        attendingCount: goingCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    
    console.log(`✅ Event ${eventId} count updated to: ${goingCount}`);
    
    return goingCount;
  } catch (error) {
    console.error(`❌ Error recalculating count for event ${eventId}:`, error);
    throw error;
  }
};

// Cloud Function: Triggered when attendee documents are created, updated, or deleted
export const onAttendeeChange = onDocumentWritten({
  document: 'events/{eventId}/attendees/{attendeeId}',
  region: 'us-east1'
}, async (event) => {
    const eventId = event.params.eventId;
    const attendeeId = event.params.attendeeId;
    
    // Determine the type of change
    const beforeExists = event.data?.before?.exists;
    const afterExists = event.data?.after?.exists;
    
    let changeType = 'unknown';
    let attendeeStatus = 'unknown';
    
    if (!beforeExists && afterExists) {
      changeType = 'CREATE';
      attendeeStatus = event.data?.after?.data()?.rsvpStatus || 'unknown';
    } else if (beforeExists && !afterExists) {
      changeType = 'DELETE';
      attendeeStatus = event.data?.before?.data()?.rsvpStatus || 'unknown';
    } else if (beforeExists && afterExists) {
      changeType = 'UPDATE';
      const beforeStatus = event.data?.before?.data()?.rsvpStatus || 'unknown';
      const afterStatus = event.data?.after?.data()?.rsvpStatus || 'unknown';
      attendeeStatus = afterStatus;
      
      if (beforeStatus !== afterStatus) {
        console.log(`🔄 Attendee status changed: ${beforeStatus} → ${afterStatus}`);
      }
    }
    
    console.log(`🔄 onAttendeeChange: ${changeType} detected for attendee ${attendeeId} in event ${eventId}`, {
      changeType,
      attendeeStatus,
      willAffectCount: attendeeStatus === 'going' || (changeType === 'DELETE' && attendeeStatus === 'going')
    });
    
    try {
      // Recalculate the event's attendee count (this queries all "going" attendees, so it's always accurate)
      const newCount = await recalculateEventAttendeeCount(eventId);
      
      console.log(`✅ onAttendeeChange: Event ${eventId} count recalculated to: ${newCount} (after ${changeType} of attendee ${attendeeId})`);
      
      return { success: true, newCount, changeType };
    } catch (error) {
      console.error(`❌ onAttendeeChange: Failed to recalculate count for event ${eventId}:`, error);
      
      // Log the error but don't fail the function
      // The client can retry or handle the error gracefully
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', changeType };
    }
  }
);

// Cloud Function: Manual count recalculation (can be called from client)
export const manualRecalculateCount = onCall({
  region: 'us-east1'
}, async (request) => {
  const { data, auth } = request;
  
  // Check if user is authenticated
  if (!auth) {
    throw new Error('User must be authenticated to recalculate counts');
  }
  
  const { eventId } = data;
  
  if (!eventId) {
    throw new Error('Event ID is required');
  }
  
  try {
    // Verify user has access to this event
    const eventDoc = await db.collection('events').doc(eventId).get();
    
    if (!eventDoc.exists) {
      throw new Error('Event not found');
    }
    
    const eventData = eventDoc.data();
    const userId = auth.uid;
    
    // Check if user is event creator, admin, or member
    const isEventOwner = eventData?.createdBy === userId;
    const isAdmin = auth.token.role === 'admin';
    const isMember = eventData?.visibility === 'public' || 
                    eventData?.visibility === 'members' ||
                    (eventData?.invitedUserIds && eventData.invitedUserIds.includes(userId));
    
    if (!isEventOwner && !isAdmin && !isMember) {
      throw new Error('User does not have permission to recalculate counts for this event');
    }
    
    // Recalculate the count
    const newCount = await recalculateEventAttendeeCount(eventId);
    
    return {
      success: true,
      eventId,
      newCount,
      recalculatedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`❌ Manual count recalculation failed for event ${eventId}:`, error);
    throw new Error(error instanceof Error ? error.message : 'Failed to recalculate count');
  }
});

// Cloud Function: Bulk attendee operations
export const bulkAttendeeOperation = onCall({
  region: 'us-east1'
}, async (request) => {
  const { data, auth } = request;
  
  // Check if user is authenticated
  if (!auth) {
    throw new Error('User must be authenticated to perform bulk operations');
  }
  
  const { eventId, attendees, operation } = data;
  
  if (!eventId || !attendees || !Array.isArray(attendees) || !operation) {
    throw new Error('Event ID, attendees array, and operation are required');
  }
  
  try {
    // Verify user has access to this event
    const eventDoc = await db.collection('events').doc(eventId).get();
    
    if (!eventDoc.exists) {
      throw new Error('Event not found');
    }
    
    const eventData = eventDoc.data();
    const userId = auth.uid;
    
    // Check permissions
    const isEventOwner = eventData?.createdBy === userId;
    const isAdmin = auth.token.role === 'admin';
    const isMember = eventData?.visibility === 'public' || 
                    eventData?.visibility === 'members' ||
                    (eventData?.invitedUserIds && eventData.invitedUserIds.includes(userId));
    
    if (!isEventOwner && !isAdmin && !isMember) {
      throw new Error('User does not have permission to perform bulk operations on this event');
    }
    
    const batch = db.batch();
    const results: any[] = [];
    
    // Process each attendee based on operation
    for (const attendee of attendees) {
      const attendeeRef = db
        .collection('events')
        .doc(eventId)
        .collection('attendees')
        .doc(attendee.attendeeId || `attendee_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
      
      switch (operation) {
        case 'create':
          batch.set(attendeeRef, {
            ...attendee,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          results.push({ operation: 'create', attendeeId: attendeeRef.id, success: true });
          break;
          
        case 'update':
          batch.update(attendeeRef, {
            ...attendee,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          results.push({ operation: 'update', attendeeId: attendeeRef.id, success: true });
          break;
          
        case 'delete':
          batch.delete(attendeeRef);
          results.push({ operation: 'delete', attendeeId: attendeeRef.id, success: true });
          break;
          
        default:
          results.push({ operation, attendeeId: attendeeRef.id, success: false, error: 'Invalid operation' });
      }
    }
    
    // Commit the batch
    await batch.commit();
    
    // Recalculate the event count
    const newCount = await recalculateEventAttendeeCount(eventId);
    
    return {
      success: true,
      eventId,
      operation,
      results,
      newCount,
      processedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`❌ Bulk attendee operation failed for event ${eventId}:`, error);
    throw new Error(error instanceof Error ? error.message : 'Failed to perform bulk operation');
  }
});
