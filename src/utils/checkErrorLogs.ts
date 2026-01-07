/**
 * Utility to check Firestore error logs for a specific time period
 * Can be imported and used in admin dashboard or called directly
 */

import { collection, query, where, getDocs, orderBy, Timestamp, limit as limitQuery } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface ErrorLogQueryOptions {
  startTime: Date;
  endTime: Date;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  component?: string;
  userId?: string;
  limit?: number;
}

export async function checkErrorLogs(options: ErrorLogQueryOptions) {
  try {
    const constraints: any[] = [];
    
    // Time range
    constraints.push(where('timestamp', '>=', Timestamp.fromDate(options.startTime)));
    constraints.push(where('timestamp', '<=', Timestamp.fromDate(options.endTime)));
    
    // Optional filters
    if (options.severity) {
      constraints.push(where('severity', '==', options.severity));
    }
    
    if (options.component) {
      constraints.push(where('component', '==', options.component));
    }
    
    if (options.userId) {
      constraints.push(where('userId', '==', options.userId));
    }
    
    // Order and limit
    constraints.push(orderBy('timestamp', 'desc'));
    
    if (options.limit) {
      constraints.push(limitQuery(options.limit));
    } else {
      constraints.push(limitQuery(100)); // Default limit
    }
    
    const q = query(collection(db, 'errorLogs'), ...constraints);
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return {
        found: false,
        count: 0,
        errors: [],
      };
    }
    
    const errors = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        message: data.message,
        code: data.code,
        stack: data.stack,
        component: data.component,
        userId: data.userId,
        severity: data.severity,
        category: data.category,
        timestamp: data.timestamp?.toDate() || null,
        url: data.url,
        userAgent: data.userAgent,
        browser: data.browser,
        os: data.os,
      };
    });
    
    return {
      found: true,
      count: errors.length,
      errors,
    };
  } catch (error: any) {
    if (error.code === 'permission-denied') {
      throw new Error('Permission denied. You need admin access to view error logs.');
    } else if (error.code === 'not-found') {
      return {
        found: false,
        count: 0,
        errors: [],
        note: 'errorLogs collection does not exist yet.',
      };
    } else {
      throw new Error(`Failed to query error logs: ${error.message}`);
    }
  }
}

/**
 * Check errors for a specific time period (e.g., 8:15 PM - 9:00 PM EST)
 */
export async function checkErrorsForTimePeriod(
  date: Date,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
  timezoneOffset: number = -5 // EST is UTC-5, EDT is UTC-4
) {
  // Create date range
  const startTime = new Date(date);
  startTime.setUTCHours(startHour - timezoneOffset, startMinute, 0, 0);
  
  const endTime = new Date(date);
  endTime.setUTCHours(endHour - timezoneOffset, endMinute, 0, 0);
  
  return checkErrorLogs({
    startTime,
    endTime,
  });
}

