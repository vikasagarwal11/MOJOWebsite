import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { EventDoc } from '../hooks/useEvents';

export class EventAttendanceService {
  private static readonly EVENTS_COLLECTION = 'events';

  /**
   * Enable QR attendance tracking for an event
   */
  static async enableQRAttendance(eventId: string): Promise<void> {
    try {
      const eventRef = doc(db, this.EVENTS_COLLECTION, eventId);
      await updateDoc(eventRef, {
        attendanceEnabled: true,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error enabling QR attendance:', error);
      throw new Error('Failed to enable QR attendance for this event');
    }
  }

  /**
   * Disable QR attendance tracking for an event
   */
  static async disableQRAttendance(eventId: string): Promise<void> {
    try {
      const eventRef = doc(db, this.EVENTS_COLLECTION, eventId);
      await updateDoc(eventRef, {
        attendanceEnabled: false,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error disabling QR attendance:', error);
      throw new Error('Failed to disable QR attendance for this event');
    }
  }

  /**
   * Toggle QR attendance tracking for an event
   */
  static async toggleQRAttendance(eventId: string, currentStatus: boolean): Promise<boolean> {
    try {
      if (currentStatus) {
        await this.disableQRAttendance(eventId);
        return false;
      } else {
        await this.enableQRAttendance(eventId);
        return true;
      }
    } catch (error) {
      console.error('Error toggling QR attendance:', error);
      throw error;
    }
  }

  /**
   * Check if user can modify QR attendance for an event
   */
  static canModifyQRAttendance(event: EventDoc, currentUserId: string): boolean {
    // Only event creators (admins) can modify QR attendance
    return event.createdBy === currentUserId;
  }

  /**
   * Check if QR attendance is available for an event
   */
  static isQRAttendanceAvailable(event: EventDoc): boolean {
    if (!event.startAt) return false;
    
    const now = Date.now();
    const eventStart = event.startAt.toMillis ? event.startAt.toMillis() : new Date(event.startAt).getTime();
    
    // QR attendance can be enabled up to 24 hours before the event
    const enableDeadline = eventStart - (24 * 60 * 60 * 1000);
    
    return now < enableDeadline;
  }
}
