import { collection, getDocs, deleteDoc, doc, updateDoc, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../config/firebase';

export const cleanupDuplicateAttendees = async (eventId: string, targetCount: number = 102) => {
  try {
    console.log(`🧹 Starting cleanup for event ${eventId}, target count: ${targetCount}`);
    
    // Get all attendees for the event
    const attendeesRef = collection(db, 'events', eventId, 'attendees');
    const attendeesQuery = query(
      attendeesRef, 
      where('isDeleted', '==', false),
      orderBy('createdAt', 'asc')
    );
    
    const snapshot = await getDocs(attendeesQuery);
    const attendees = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`📊 Found ${attendees.length} total attendees`);
    
    if (attendees.length <= targetCount && targetCount > 0) {
      console.log(`✅ No cleanup needed. Current count: ${attendees.length}, target: ${targetCount}`);
      return;
    }
    
    let attendeesToDelete: any[] = [];
    
    if (targetCount === 0) {
      // Delete all attendees
      attendeesToDelete = attendees;
      console.log(`🗑️ Will delete ALL ${attendeesToDelete.length} attendees`);
    } else {
      // Sort by creation time and keep the first targetCount attendees
      const attendeesToKeep = attendees.slice(0, targetCount);
      attendeesToDelete = attendees.slice(targetCount);
      console.log(`🗑️ Will delete ${attendeesToDelete.length} duplicate attendees`);
    }
    
    // Delete the attendees
    for (const attendee of attendeesToDelete) {
      await deleteDoc(doc(db, 'events', eventId, 'attendees', attendee.id));
      console.log(`🗑️ Deleted attendee: ${attendee.name} (${attendee.id})`);
    }
    
    // Update the event's attendingCount
    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, {
      attendingCount: targetCount,
      updatedAt: new Date()
    });
    
    console.log(`✅ Cleanup completed. Event now has ${targetCount} attendees`);
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  }
};

// Function to get current attendee count
export const getCurrentAttendeeCount = async (eventId: string): Promise<number> => {
  try {
    const attendeesRef = collection(db, 'events', eventId, 'attendees');
    const attendeesQuery = query(
      attendeesRef, 
      where('isDeleted', '==', false)
    );
    
    const snapshot = await getDocs(attendeesQuery);
    return snapshot.size;
  } catch (error) {
    console.error('Error getting attendee count:', error);
    return 0;
  }
};
