import { Timestamp } from 'firebase/firestore';

export interface AttendanceRecord {
  id: string;
  eventId: string;
  userId: string;
  userName: string;
  userEmail: string;
  scannedAt: Timestamp;
  deviceInfo?: string;
  location?: string; // Optional GPS coordinates
  qrCodeData: string; // The actual QR data scanned
  isDuplicate?: boolean; // Flag for duplicate scans
}

export interface QRCodeData {
  eventId: string;
  eventTitle: string;
  generatedAt: number; // Timestamp
  token: string; // Security token
  expiresAt?: number; // Optional expiration
}

export interface AttendanceStats {
  totalScans: number;
  uniqueAttendees: number;
  duplicateScans: number;
  lastScanAt?: Timestamp;
  scanRate: number; // Scans per minute
}

export interface AttendanceAnalytics {
  eventId: string;
  eventTitle: string;
  totalRSVPs: number; // From existing RSVP system
  totalAttendance: number; // From QR scans
  attendanceRate: number; // attendance / rsvps
  peakScanTime?: Timestamp;
  hourlyBreakdown: { hour: number; count: number }[];
  deviceBreakdown: { device: string; count: number }[];
}
