import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  Timestamp,
  onSnapshot,
  serverTimestamp,
  increment,
  writeBatch
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { AttendanceRecord } from '../types/attendance';

export interface GroupAttendanceRecord {
  id: string;
  eventId: string;
  groupId: string; // Unique identifier for this check-in session
  primaryUserId: string; // User who scanned the QR code
  members: {
    id: string;
    name: string;
    role: string;
    userId?: string; // If they have an account
    isCheckedIn: boolean;
  }[];
  checkedInAt: Timestamp;
  deviceInfo?: string;
  location?: string;
  qrCodeData: string;
  isOffline?: boolean; // Flag for offline check-ins
  syncedAt?: Timestamp; // When offline data was synced
}

export interface GroupCheckinData {
  eventId: string;
  primaryUserId: string;
  members: {
    id: string;
    name: string;
    role: string;
    userId?: string;
    isCheckedIn: boolean;
  }[];
  qrCodeData: string;
  deviceInfo?: string;
  location?: string;
}

export class GroupAttendanceService {
  private static readonly COLLECTION_NAME = 'group_attendance';
  private static readonly INDIVIDUAL_COLLECTION_NAME = 'event_attendance';

  /**
   * Record group attendance from QR code scan
   */
  static async recordGroupAttendance(
    checkinData: GroupCheckinData
  ): Promise<{ success: boolean; groupId: string; message: string; individualRecords: string[] }> {
    try {
      const batch = writeBatch(db);
      const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const individualRecordIds: string[] = [];

      // Create group attendance record
      const groupRecord: Omit<GroupAttendanceRecord, 'id'> = {
        eventId: checkinData.eventId,
        groupId,
        primaryUserId: checkinData.primaryUserId,
        members: checkinData.members,
        checkedInAt: serverTimestamp() as Timestamp,
        deviceInfo: checkinData.deviceInfo,
        location: checkinData.location,
        qrCodeData: checkinData.qrCodeData,
        isOffline: false
      };

      const groupDocRef = doc(collection(db, this.COLLECTION_NAME));
      batch.set(groupDocRef, groupRecord);

      // Create individual attendance records for each checked-in member
      for (const member of checkinData.members) {
        if (member.isCheckedIn) {
          const individualRecord: Omit<AttendanceRecord, 'id'> = {
            eventId: checkinData.eventId,
            userId: member.userId || member.id, // Use userId if available, otherwise use member.id
            userName: member.name,
            userEmail: '', // Will be populated if user has account
            scannedAt: serverTimestamp() as Timestamp,
            deviceInfo: checkinData.deviceInfo,
            location: checkinData.location,
            qrCodeData: checkinData.qrCodeData,
            isDuplicate: false
          };

          const individualDocRef = doc(collection(db, this.INDIVIDUAL_COLLECTION_NAME));
          batch.set(individualDocRef, individualRecord);
          individualRecordIds.push(individualDocRef.id);
        }
      }

      // Update event attendance count
      const eventDocRef = doc(db, 'events', checkinData.eventId);
      batch.update(eventDocRef, {
        attendanceCount: increment(checkinData.members.filter(m => m.isCheckedIn).length),
        lastAttendanceUpdate: serverTimestamp()
      });

      // Commit all changes
      await batch.commit();

      console.log('✅ Group attendance recorded successfully:', groupId);

      return {
        success: true,
        groupId,
        message: `Successfully checked in ${checkinData.members.filter(m => m.isCheckedIn).length} members`,
        individualRecords: individualRecordIds
      };
    } catch (error) {
      console.error('❌ Error recording group attendance:', error);
      return {
        success: false,
        groupId: '',
        message: 'Failed to record group attendance. Please try again.',
        individualRecords: []
      };
    }
  }

  /**
   * Save offline group check-in to local storage
   */
  static saveOfflineGroupCheckin(checkinData: GroupCheckinData): void {
    try {
      const offlineData = {
        ...checkinData,
        checkedInAt: new Date().toISOString(),
        isOffline: true,
        id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      const existingData = JSON.parse(localStorage.getItem('offlineGroupCheckins') || '[]');
      existingData.push(offlineData);
      localStorage.setItem('offlineGroupCheckins', JSON.stringify(existingData));

      console.log('💾 Offline group check-in saved:', offlineData.id);
    } catch (error) {
      console.error('❌ Error saving offline group check-in:', error);
    }
  }

  /**
   * Sync offline group check-ins when back online
   */
  static async syncOfflineGroupCheckins(): Promise<{ synced: number; failed: number }> {
    try {
      const offlineData = JSON.parse(localStorage.getItem('offlineGroupCheckins') || '[]');
      if (offlineData.length === 0) {
        return { synced: 0, failed: 0 };
      }

      let synced = 0;
      let failed = 0;

      for (const checkin of offlineData) {
        try {
          const result = await this.recordGroupAttendance(checkin);
          if (result.success) {
            synced++;
          } else {
            failed++;
          }
        } catch (error) {
          console.error('Error syncing offline check-in:', error);
          failed++;
        }
      }

      // Clear synced data
      if (synced > 0) {
        localStorage.removeItem('offlineGroupCheckins');
      }

      console.log(`🔄 Synced ${synced} offline group check-ins, ${failed} failed`);
      return { synced, failed };
    } catch (error) {
      console.error('❌ Error syncing offline group check-ins:', error);
      return { synced: 0, failed: 0 };
    }
  }

  /**
   * Get group attendance records for an event
   */
  static async getEventGroupAttendance(eventId: string): Promise<GroupAttendanceRecord[]> {
    try {
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('eventId', '==', eventId),
        orderBy('checkedInAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as GroupAttendanceRecord[];
    } catch (error) {
      console.error('Error getting group attendance records:', error);
      return [];
    }
  }

  /**
   * Get offline check-ins count
   */
  static getOfflineCheckinsCount(): number {
    try {
      const offlineData = JSON.parse(localStorage.getItem('offlineGroupCheckins') || '[]');
      return offlineData.length;
    } catch (error) {
      console.error('Error getting offline check-ins count:', error);
      return 0;
    }
  }

  /**
   * Clear offline check-ins (for testing or manual cleanup)
   */
  static clearOfflineCheckins(): void {
    localStorage.removeItem('offlineGroupCheckins');
    console.log('🗑️ Cleared offline group check-ins');
  }

  /**
   * Subscribe to real-time group attendance updates for an event
   */
  static subscribeToEventGroupAttendance(
    eventId: string, 
    callback: (attendance: GroupAttendanceRecord[]) => void
  ): () => void {
    const q = query(
      collection(db, this.COLLECTION_NAME),
      where('eventId', '==', eventId),
      orderBy('checkedInAt', 'desc')
    );

    return onSnapshot(q, (querySnapshot) => {
      const attendance = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as GroupAttendanceRecord[];
      
      callback(attendance);
    });
  }
}
