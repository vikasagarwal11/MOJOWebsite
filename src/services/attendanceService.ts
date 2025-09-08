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
  increment
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { AttendanceRecord, AttendanceStats, AttendanceAnalytics } from '../types/attendance';
import { EventDoc } from '../hooks/useEvents';

export class AttendanceService {
  private static readonly COLLECTION_NAME = 'event_attendance';

  /**
   * Record attendance from QR code scan
   */
  static async recordAttendance(
    eventId: string,
    userId: string,
    userName: string,
    userEmail: string,
    qrCodeData: string,
    deviceInfo?: string,
    location?: string
  ): Promise<{ success: boolean; isDuplicate: boolean; message: string }> {
    try {
      // Check for existing attendance record
      const existingRecord = await this.getAttendanceRecord(eventId, userId);
      
      if (existingRecord) {
        return {
          success: false,
          isDuplicate: true,
          message: 'You have already checked in for this event'
        };
      }

      // Create new attendance record
      const attendanceRecord: Omit<AttendanceRecord, 'id'> = {
        eventId,
        userId,
        userName,
        userEmail,
        scannedAt: serverTimestamp() as Timestamp,
        deviceInfo,
        location,
        qrCodeData,
        isDuplicate: false
      };

      const docRef = await addDoc(collection(db, this.COLLECTION_NAME), attendanceRecord);

      // Update event attendance count
      await this.updateEventAttendanceCount(eventId, 1);

      console.log('✅ Attendance recorded successfully:', docRef.id);

      return {
        success: true,
        isDuplicate: false,
        message: 'Successfully checked in!'
      };
    } catch (error) {
      console.error('❌ Error recording attendance:', error);
      return {
        success: false,
        isDuplicate: false,
        message: 'Failed to record attendance. Please try again.'
      };
    }
  }

  /**
   * Get attendance record for a specific user and event
   */
  static async getAttendanceRecord(eventId: string, userId: string): Promise<AttendanceRecord | null> {
    try {
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('eventId', '==', eventId),
        where('userId', '==', userId)
      );

      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        return null;
      }

      const doc = querySnapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data()
      } as AttendanceRecord;
    } catch (error) {
      console.error('Error getting attendance record:', error);
      return null;
    }
  }

  /**
   * Get all attendance records for an event
   */
  static async getEventAttendance(eventId: string): Promise<AttendanceRecord[]> {
    try {
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('eventId', '==', eventId),
        orderBy('scannedAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AttendanceRecord[];
    } catch (error) {
      console.error('Error getting event attendance:', error);
      return [];
    }
  }

  /**
   * Get attendance statistics for an event
   */
  static async getEventAttendanceStats(eventId: string): Promise<AttendanceStats> {
    try {
      const attendanceRecords = await this.getEventAttendance(eventId);
      
      const totalScans = attendanceRecords.length;
      const uniqueAttendees = new Set(attendanceRecords.map(record => record.userId)).size;
      const duplicateScans = totalScans - uniqueAttendees;
      
      const lastScanAt = attendanceRecords.length > 0 ? attendanceRecords[0].scannedAt : undefined;
      
      // Calculate scan rate (scans per minute)
      let scanRate = 0;
      if (attendanceRecords.length > 1) {
        const firstScan = attendanceRecords[attendanceRecords.length - 1].scannedAt;
        const lastScan = attendanceRecords[0].scannedAt;
        const timeDiff = (lastScan.toMillis() - firstScan.toMillis()) / (1000 * 60); // minutes
        scanRate = timeDiff > 0 ? totalScans / timeDiff : 0;
      }

      return {
        totalScans,
        uniqueAttendees,
        duplicateScans,
        lastScanAt,
        scanRate
      };
    } catch (error) {
      console.error('Error getting attendance stats:', error);
      return {
        totalScans: 0,
        uniqueAttendees: 0,
        duplicateScans: 0,
        scanRate: 0
      };
    }
  }

  /**
   * Get attendance analytics for an event
   */
  static async getEventAttendanceAnalytics(eventId: string, event: EventDoc): Promise<AttendanceAnalytics> {
    try {
      const attendanceRecords = await this.getEventAttendance(eventId);
      const totalRSVPs = event.attendingCount || 0;
      const totalAttendance = attendanceRecords.length;
      const attendanceRate = totalRSVPs > 0 ? (totalAttendance / totalRSVPs) * 100 : 0;

      // Hourly breakdown
      const hourlyBreakdown = this.calculateHourlyBreakdown(attendanceRecords);
      
      // Device breakdown
      const deviceBreakdown = this.calculateDeviceBreakdown(attendanceRecords);

      // Peak scan time
      const peakScanTime = this.calculatePeakScanTime(attendanceRecords);

      return {
        eventId,
        eventTitle: event.title,
        totalRSVPs,
        totalAttendance,
        attendanceRate,
        peakScanTime,
        hourlyBreakdown,
        deviceBreakdown
      };
    } catch (error) {
      console.error('Error getting attendance analytics:', error);
      return {
        eventId,
        eventTitle: event.title,
        totalRSVPs: 0,
        totalAttendance: 0,
        attendanceRate: 0,
        hourlyBreakdown: [],
        deviceBreakdown: []
      };
    }
  }

  /**
   * Update event attendance count
   */
  static async updateEventAttendanceCount(eventId: string, increment: number): Promise<void> {
    try {
      const eventRef = doc(db, 'events', eventId);
      await updateDoc(eventRef, {
        attendanceCount: increment(increment),
        lastAttendanceUpdate: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating event attendance count:', error);
    }
  }

  /**
   * Subscribe to real-time attendance updates for an event
   */
  static subscribeToEventAttendance(
    eventId: string, 
    callback: (attendance: AttendanceRecord[]) => void
  ): () => void {
    const q = query(
      collection(db, this.COLLECTION_NAME),
      where('eventId', '==', eventId),
      orderBy('scannedAt', 'desc')
    );

    return onSnapshot(q, (querySnapshot) => {
      const attendance = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AttendanceRecord[];
      
      callback(attendance);
    });
  }

  /**
   * Calculate hourly breakdown of attendance
   */
  private static calculateHourlyBreakdown(records: AttendanceRecord[]): { hour: number; count: number }[] {
    const hourlyCounts: { [hour: number]: number } = {};
    
    records.forEach(record => {
      const hour = record.scannedAt.toDate().getHours();
      hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1;
    });

    return Object.entries(hourlyCounts).map(([hour, count]) => ({
      hour: parseInt(hour),
      count
    })).sort((a, b) => a.hour - b.hour);
  }

  /**
   * Calculate device breakdown of attendance
   */
  private static calculateDeviceBreakdown(records: AttendanceRecord[]): { device: string; count: number }[] {
    const deviceCounts: { [device: string]: number } = {};
    
    records.forEach(record => {
      const device = record.deviceInfo || 'Unknown';
      deviceCounts[device] = (deviceCounts[device] || 0) + 1;
    });

    return Object.entries(deviceCounts).map(([device, count]) => ({
      device,
      count
    })).sort((a, b) => b.count - a.count);
  }

  /**
   * Calculate peak scan time
   */
  private static calculatePeakScanTime(records: AttendanceRecord[]): Timestamp | undefined {
    if (records.length === 0) return undefined;

    const hourlyCounts = this.calculateHourlyBreakdown(records);
    const peakHour = hourlyCounts.reduce((max, current) => 
      current.count > max.count ? current : max
    );

    // Find a record from the peak hour
    const peakRecord = records.find(record => 
      record.scannedAt.toDate().getHours() === peakHour.hour
    );

    return peakRecord?.scannedAt;
  }
}
