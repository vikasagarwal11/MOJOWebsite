import { collection, deleteDoc, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { db, storage } from '../config/firebase';

export interface EventDeletionResult {
  success: boolean;
  deletedCounts: {
    event: number;
    attendees: number;
    rsvps: number;
    mediaFiles: number;
  };
  errors: string[];
}

export class EventDeletionService {
  /**
   * Delete an event and all its associated data
   * @param eventId - The ID of the event to delete
   * @param adminId - The ID of the admin performing the deletion
   * @returns Promise<EventDeletionResult>
   */
  static async deleteEvent(eventId: string, adminId: string): Promise<EventDeletionResult> {
    const result: EventDeletionResult = {
      success: false,
      deletedCounts: {
        event: 0,
        attendees: 0,
        rsvps: 0,
        mediaFiles: 0
      },
      errors: []
    };

    try {
      console.log(`🗑️ [EventDeletion] Starting deletion of event ${eventId} by admin ${adminId}`);

      // 1. Get event data first to check for associated media
      const eventRef = doc(db, 'events', eventId);
      const eventDoc = await getDoc(eventRef);
      
      if (!eventDoc.exists()) {
        result.errors.push('Event not found');
        return result;
      }

      const eventData = eventDoc.data();
      console.log(`🗑️ [EventDeletion] Event data retrieved:`, eventData);

      // 2. Delete all attendees
      const attendeesResult = await this.deleteAttendees(eventId);
      result.deletedCounts.attendees = attendeesResult.attendees;
      result.deletedCounts.rsvps = attendeesResult.rsvps;
      result.errors.push(...attendeesResult.errors);

      // 3. Delete associated media files from storage
      const mediaResult = await this.deleteEventMediaFiles(eventId, eventData);
      result.deletedCounts.mediaFiles = mediaResult.deletedFiles;
      result.errors.push(...mediaResult.errors);

      // 4. Delete the main event document
      await deleteDoc(eventRef);
      result.deletedCounts.event = 1;
      console.log(`✅ [EventDeletion] Event document deleted`);

      // Note: Cloud Functions handle event_teasers cleanup when events are deleted
      // (see onEventTeaserSync in functions/src/index.ts)

      result.success = true;
      console.log(`✅ [EventDeletion] Event deletion completed successfully:`, result.deletedCounts);

    } catch (error) {
      console.error('❌ [EventDeletion] Error deleting event:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error occurred');
    }

    return result;
  }

  /**
   * Delete all attendees and RSVPs for an event
   */
  private static async deleteAttendees(eventId: string): Promise<{
    attendees: number;
    rsvps: number;
    errors: string[];
  }> {
    const result = {
      attendees: 0,
      rsvps: 0,
      errors: [] as string[]
    };

    try {
      // Delete attendees subcollection
      const attendeesRef = collection(db, 'events', eventId, 'attendees');
      const attendeesSnapshot = await getDocs(attendeesRef);
      
      const batch = writeBatch(db);
      attendeesSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      if (attendeesSnapshot.docs.length > 0) {
        await batch.commit();
        result.attendees = attendeesSnapshot.docs.length;
        console.log(`✅ [EventDeletion] Deleted ${result.attendees} attendees`);
      }

      // Legacy RSVPs subcollection (if exists)
      const rsvpsRef = collection(db, 'events', eventId, 'rsvps');
      const rsvpsSnapshot = await getDocs(rsvpsRef);
      
      if (rsvpsSnapshot.docs.length > 0) {
        const rsvpsBatch = writeBatch(db);
        rsvpsSnapshot.docs.forEach((doc) => {
          rsvpsBatch.delete(doc.ref);
        });
        await rsvpsBatch.commit();
        result.rsvps = rsvpsSnapshot.docs.length;
        console.log(`✅ [EventDeletion] Deleted ${result.rsvps} legacy RSVPs`);
      }

    } catch (error) {
      console.error('❌ [EventDeletion] Error deleting attendees:', error);
      result.errors.push(error instanceof Error ? error.message : 'Failed to delete attendees');
    }

    return result;
  }

  /**
   * Delete event media files from storage
   */
  private static async deleteEventMediaFiles(
    eventId: string,
    eventData: any
  ): Promise<{
    deletedFiles: number;
    errors: string[];
  }> {
    const result = {
      deletedFiles: 0,
      errors: [] as string[]
    };

    try {
      // Delete event image if exists
      if (eventData.imageUrl) {
        try {
          // Extract path from URL or construct it
          let imagePath = eventData.imageUrl;
          
          // If it's a full URL, extract the path
          if (imagePath.includes('/o/')) {
            const match = imagePath.match(/\/o\/([^?]+)/);
            if (match) {
              imagePath = decodeURIComponent(match[1]);
            }
          } else if (imagePath.startsWith('events/')) {
            // Already a path
            imagePath = imagePath;
          } else {
            // Construct path
            imagePath = `events/${eventId}/${imagePath.split('/').pop()}`;
          }

          const imageRef = ref(storage, imagePath);
          await deleteObject(imageRef);
          result.deletedFiles++;
          console.log(`✅ [EventDeletion] Deleted event image: ${imagePath}`);
        } catch (error) {
          console.warn('⚠️ [EventDeletion] Could not delete event image:', error);
          result.errors.push('Failed to delete event image');
        }
      }

      // Delete all files in the event's storage folder
      try {
        const eventFolderRef = ref(storage, `events/${eventId}`);
        // Note: Firebase Storage doesn't support folder deletion directly
        // Individual files need to be deleted one by one
        // For now, we'll just delete the main image
        // If you have a list of all files, you can delete them here
      } catch (error) {
        console.warn('⚠️ [EventDeletion] Could not access event folder:', error);
      }

    } catch (error) {
      console.error('❌ [EventDeletion] Error deleting media files:', error);
      result.errors.push(error instanceof Error ? error.message : 'Failed to delete media files');
    }

    return result;
  }
}

