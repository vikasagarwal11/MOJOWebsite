import QRCode from 'qrcode';
import { QRCodeData } from '../types/attendance';
import { Timestamp } from 'firebase/firestore';

export class QRCodeService {
  /**
   * Generate QR code data for an event
   */
  static generateQRData(eventId: string, eventTitle: string): QRCodeData {
    const now = Date.now();
    const token = this.generateSecurityToken(eventId, now);
    
    // Check if we're in development mode
    const isDevelopment = import.meta.env.DEV || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1')));
    
    // In development: QR codes last 7 days, in production: 24 hours
    const expirationTime = isDevelopment ? (7 * 24 * 60 * 60 * 1000) : (24 * 60 * 60 * 1000);
    
    return {
      eventId,
      eventTitle,
      generatedAt: now,
      token,
      expiresAt: now + expirationTime
    };
  }

  /**
   * Generate QR code as base64 image
   */
  static async generateQRCodeImage(qrData: QRCodeData): Promise<string> {
    try {
        // Determine the check-in URL based on environment
        const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1');
        const baseUrl = isDevelopment
          ? `http://${window.location.hostname}:5175/checkin.html`  // Use current hostname for mobile testing
          : 'https://momsfitnessmojo.com/checkin.html';  // Production with custom domain
      
      // Use a URL format instead of JSON to avoid phone number interpretation
      const qrString = `${baseUrl}?event=${qrData.eventId}&token=${qrData.token}&t=${qrData.generatedAt}`;
      
      // Log for development debugging
      if (isDevelopment) {
        console.log('🔧 QR Code Generated (Development):', {
          environment: 'development',
          baseUrl,
          qrString,
          eventId: qrData.eventId,
          expiresAt: new Date(qrData.expiresAt).toLocaleString()
        });
      }
      const qrCodeDataURL = await QRCode.toDataURL(qrString, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      });
      return qrCodeDataURL;
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Generate QR code as SVG string
   */
  static async generateQRCodeSVG(qrData: QRCodeData): Promise<string> {
    try {
      const qrString = JSON.stringify(qrData);
      const qrCodeSVG = await QRCode.toString(qrString, {
        type: 'svg',
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      });
      return qrCodeSVG;
    } catch (error) {
      console.error('Error generating QR code SVG:', error);
      throw new Error('Failed to generate QR code SVG');
    }
  }

  /**
   * Parse QR code data from scanned string
   */
  static parseQRData(qrString: string): QRCodeData | null {
    try {
      // Handle URL format QR codes (both development and production)
      if (qrString.includes('/checkin.html?') && (qrString.startsWith('https://momsfitnessmojo.com/') || qrString.startsWith('https://momfitnessmojo.web.app/') || qrString.startsWith('http://localhost:') || qrString.includes('127.0.0.1') || qrString.includes('192.168.') || qrString.includes('10.0.') || qrString.includes('172.'))) {
        const url = new URL(qrString);
        const eventId = url.searchParams.get('event');
        const token = url.searchParams.get('token');
        const timestamp = url.searchParams.get('t');
        
        if (!eventId || !token || !timestamp) {
          return null;
        }
        
        const generatedAt = parseInt(timestamp);
        if (isNaN(generatedAt)) {
          return null;
        }
        
        // Check if QR code has expired (development: 7 days, production: 24 hours)
        const isDevelopment = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1'));
        const expirationTime = isDevelopment ? (7 * 24 * 60 * 60 * 1000) : (24 * 60 * 60 * 1000);
        const expiresAt = generatedAt + expirationTime;
        if (Date.now() > expiresAt) {
          return null;
        }
        
        return {
          eventId,
          eventTitle: 'Event Check-in', // We'll need to fetch this from the event
          generatedAt,
          token,
          expiresAt
        };
      }
      
      // Fallback to JSON format for backward compatibility
      const qrData = JSON.parse(qrString) as QRCodeData;
      
      // Validate required fields
      if (!qrData.eventId || !qrData.eventTitle || !qrData.generatedAt || !qrData.token) {
        return null;
      }

      // Check if QR code has expired
      if (qrData.expiresAt && Date.now() > qrData.expiresAt) {
        return null;
      }

      return qrData;
    } catch (error) {
      console.error('Error parsing QR code data:', error);
      return null;
    }
  }

  /**
   * Validate QR code data
   */
  static validateQRData(qrData: QRCodeData, eventId: string): boolean {
    // Check if QR code is for the correct event
    if (qrData.eventId !== eventId) {
      return false;
    }

    // Check if QR code has expired
    if (qrData.expiresAt && Date.now() > qrData.expiresAt) {
      return false;
    }

    // Validate security token
    const expectedToken = this.generateSecurityToken(qrData.eventId, qrData.generatedAt);
    if (qrData.token !== expectedToken) {
      return false;
    }

    return true;
  }

  /**
   * Generate security token for QR code validation
   */
  private static generateSecurityToken(eventId: string, timestamp: number): string {
    // Simple hash function for token generation
    // Use a browser-compatible approach instead of process.env
    const secret = import.meta.env.VITE_QR_SECRET || 'default-secret';
    const data = `${eventId}-${timestamp}-${secret}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Check if QR code is valid for scanning
   */
  static isQRCodeValid(qrData: QRCodeData, eventStartTime: Timestamp): boolean {
    const now = Date.now();
    const eventStart = eventStartTime.toMillis();
    
    // Check if we're in development mode
    const isDevelopment = import.meta.env.DEV || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1')));
    
    if (isDevelopment) {
      // In development: much more relaxed validation
      // QR code is valid for 7 days from generation, regardless of event time
      const qrExpired = qrData.expiresAt && now > qrData.expiresAt;
      const sevenDaysFromGeneration = qrData.generatedAt + (7 * 24 * 60 * 60 * 1000);
      const isValid = !qrExpired && now <= sevenDaysFromGeneration;
      
      console.log('🔧 QR Code Validation (Development):', {
        environment: 'development',
        isValid,
        qrExpired,
        now: new Date(now).toLocaleString(),
        generatedAt: new Date(qrData.generatedAt).toLocaleString(),
        expiresAt: new Date(qrData.expiresAt).toLocaleString(),
        sevenDaysFromGeneration: new Date(sevenDaysFromGeneration).toLocaleString()
      });
      
      return isValid;
    } else {
      // In production: strict validation
      // QR code should be valid from 24 hours before event start to 2 hours after event end
      const validFrom = eventStart - (24 * 60 * 60 * 1000); // 24 hours before
      const validTo = eventStart + (4 * 60 * 60 * 1000); // 4 hours after start (assuming 2-hour event)
      
      // Also check if the QR code itself hasn't expired
      const qrExpired = qrData.expiresAt && now > qrData.expiresAt;
      
      return !qrExpired && now >= validFrom && now <= validTo;
    }
  }
}
