/**
 * Firestore Error Logging Service
 * 
 * Logs errors to Firestore for querying and analysis.
 * This complements the existing ErrorService by providing persistent storage.
 */

import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { ErrorInfo } from './errorService';

export interface FirestoreErrorLog {
  message: string;
  code?: string | null;
  stack?: string | null;
  component?: string | null;
  userId?: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'auth' | 'firestore' | 'storage' | 'network' | 'validation' | 'unknown';
  timestamp: Timestamp;
  url: string;
  userAgent: string;
  platform: string;
  browser?: string;
  os?: string;
  viewport?: {
    width: number;
    height: number;
  };
}

/**
 * Log error to Firestore
 * Only logs in production to save on Firestore writes
 */
export async function logErrorToFirestore(errorInfo: ErrorInfo): Promise<void> {
  try {
    // Only log in production
    if (!import.meta.env.PROD) {
      if (import.meta.env.DEV) {
        console.log('📝 [ErrorLogger] Would log to Firestore in production:', {
          message: errorInfo.message,
          component: errorInfo.component,
          severity: errorInfo.severity,
        });
      }
      return;
    }

    // Skip low-severity errors to reduce noise (optional - remove if you want all errors)
    // if (errorInfo.severity === 'low') {
    //   return;
    // }

    // Get browser/user info
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
    const platform = typeof navigator !== 'undefined' ? navigator.platform : 'unknown';
    
    // Parse browser info
    let browser = 'unknown';
    let os = 'unknown';
    
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';
    else if (userAgent.includes('Edge')) browser = 'Edge';
    
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iOS')) os = 'iOS';

    // Get viewport info
    const viewport = typeof window !== 'undefined' ? {
      width: window.innerWidth,
      height: window.innerHeight,
    } : undefined;

    // Create error document
    const errorDoc: Omit<FirestoreErrorLog, 'timestamp'> & { timestamp: ReturnType<typeof serverTimestamp> } = {
      message: errorInfo.message,
      code: errorInfo.code || null,
      stack: errorInfo.stack || null,
      component: errorInfo.component || null,
      userId: errorInfo.userId || null,
      severity: errorInfo.severity,
      category: errorInfo.category,
      timestamp: serverTimestamp(),
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      userAgent,
      platform,
      browser,
      os,
      viewport: viewport || undefined,
    };

    // Add to Firestore
    await addDoc(collection(db, 'errorLogs'), errorDoc);
    
    if (import.meta.env.DEV) {
      console.log('✅ [ErrorLogger] Error logged to Firestore:', {
        message: errorInfo.message,
        component: errorInfo.component,
      });
    }
  } catch (error) {
    // Silent fail - don't break app if error logging fails
    // Use console.warn to avoid infinite loops
    console.warn('⚠️ [ErrorLogger] Failed to log error to Firestore:', error);
  }
}

/**
 * Query errors from Firestore
 * Requires admin access
 */
export async function queryErrors(options: {
  startTime?: Date;
  endTime?: Date;
  severity?: ErrorInfo['severity'];
  component?: string;
  limit?: number;
} = {}): Promise<FirestoreErrorLog[]> {
  try {
    const { query: firestoreQuery, where, orderBy, limit: limitQuery, Timestamp: FirestoreTimestamp, getDocs } = await import('firebase/firestore');
    
    const constraints: any[] = [];
    
    if (options.startTime) {
      constraints.push(where('timestamp', '>=', FirestoreTimestamp.fromDate(options.startTime)));
    }
    
    if (options.endTime) {
      constraints.push(where('timestamp', '<=', FirestoreTimestamp.fromDate(options.endTime)));
    }
    
    if (options.severity) {
      constraints.push(where('severity', '==', options.severity));
    }
    
    if (options.component) {
      constraints.push(where('component', '==', options.component));
    }
    
    constraints.push(orderBy('timestamp', 'desc'));
    
    if (options.limit) {
      constraints.push(limitQuery(options.limit));
    }
    
    const q = firestoreQuery(collection(db, 'errorLogs'), ...constraints);
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as any));
  } catch (error) {
    console.error('Failed to query errors:', error);
    return [];
  }
}

