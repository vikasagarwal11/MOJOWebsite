import { getMessaging, getToken, deleteToken, onMessage, Messaging } from 'firebase/messaging';
import { doc, updateDoc, getDoc, deleteField } from 'firebase/firestore';
import { db } from '../config/firebase';
import app from '../config/firebase';
import toast from 'react-hot-toast';

// VAPID key for Firebase Cloud Messaging
// This should be in your Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

// Log VAPID_KEY status on module load (for debugging)
if (typeof window !== 'undefined') {
  if (!VAPID_KEY) {
    console.warn('⚠️ FCM: VAPID_KEY not configured. Push notifications will not work.');
    console.warn('⚠️ FCM: Add VITE_FIREBASE_VAPID_KEY to your .env.production file');
    console.warn('⚠️ FCM: Get it from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates');
  } else {
    console.log('✅ FCM: VAPID_KEY configured:', VAPID_KEY.substring(0, 20) + '...');
  }
}

let messagingInstance: Messaging | null = null;

/**
 * Initialize Firebase Cloud Messaging
 */
function getMessagingInstance(): Messaging | null {
  if (!('serviceWorker' in navigator)) {
    console.warn('⚠️ Service Worker not supported - push notifications unavailable');
    return null;
  }

  try {
    if (!messagingInstance) {
      messagingInstance = getMessaging(app);
    }
    return messagingInstance;
  } catch (error) {
    console.error('❌ Error initializing FCM:', error);
    return null;
  }
}

/**
 * Request browser permission for push notifications
 */
async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    throw new Error('This browser does not support notifications');
  }

  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Get FCM token for current user
 */
export async function getFCMToken(): Promise<string | null> {
  try {
    const messaging = getMessagingInstance();
    if (!messaging) {
      console.warn('⚠️ Messaging not available');
      return null;
    }

    if (!VAPID_KEY) {
      console.warn('⚠️ VAPID key not configured - push notifications unavailable');
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('ℹ️ Notification permission denied');
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
    });

    if (token) {
      console.log('✅ FCM token obtained:', token.substring(0, 20) + '...');
      return token;
    } else {
      console.warn('⚠️ No FCM token available');
      return null;
    }
  } catch (error) {
    console.error('❌ Error getting FCM token:', error);
    return null;
  }
}

/**
 * Enable push notifications for user
 */
export async function enablePushNotifications(userId: string): Promise<boolean> {
  try {
    // Request browser permission
    const permission = await requestNotificationPermission();
    
    if (permission !== 'granted') {
      toast.error('Notification permission denied. Please enable notifications in your browser settings.');
      return false;
    }

    // Get FCM token
    const token = await getFCMToken();
    if (!token) {
      toast.error('Failed to register for push notifications. Please try again.');
      return false;
    }

    // Store token and preference in user document
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      fcmToken: token,
      'notificationPreferences.pushEnabled': true,
      'notificationPreferences.updatedAt': new Date(),
    });

    toast.success('Push notifications enabled!');
    console.log('✅ Push notifications enabled for user:', userId);
    return true;
  } catch (error: any) {
    console.error('❌ Error enabling push notifications:', error);
    toast.error(error?.message || 'Failed to enable push notifications');
    return false;
  }
}

/**
 * Disable push notifications for user
 */
export async function disablePushNotifications(userId: string): Promise<boolean> {
  try {
    const messaging = getMessagingInstance();
    
    // Delete FCM token
    if (messaging) {
      try {
        const currentToken = await getFCMToken();
        if (currentToken) {
          await deleteToken(messaging);
          console.log('✅ FCM token deleted');
        }
      } catch (tokenError) {
        console.warn('⚠️ Error deleting FCM token:', tokenError);
        // Continue anyway - we'll still remove it from database
      }
    }

    // Remove token and update preference in user document
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      fcmToken: deleteField(),
      'notificationPreferences.pushEnabled': false,
      'notificationPreferences.updatedAt': new Date(),
    });

    toast.success('Push notifications disabled');
    console.log('✅ Push notifications disabled for user:', userId);
    return true;
  } catch (error: any) {
    console.error('❌ Error disabling push notifications:', error);
    toast.error(error?.message || 'Failed to disable push notifications');
    return false;
  }
}

/**
 * Check if push notifications are enabled for user
 */
export async function isPushNotificationsEnabled(userId: string): Promise<boolean> {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      return false;
    }

    const userData = userSnap.data();
    const hasToken = !!userData?.fcmToken;
    const preferenceEnabled = userData?.notificationPreferences?.pushEnabled !== false;
    
    // Enabled if has token AND preference is not explicitly false
    return hasToken && preferenceEnabled;
  } catch (error) {
    console.error('❌ Error checking push notification status:', error);
    return false;
  }
}

/**
 * Get current notification preferences
 */
export async function getNotificationPreferences(userId: string): Promise<{
  pushEnabled: boolean;
  smsEnabled: boolean;
  fcmToken?: string;
}> {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      return { pushEnabled: false, smsEnabled: true }; // Default: SMS enabled, push disabled
    }

    const userData = userSnap.data();
    const prefs = userData?.notificationPreferences || {};
    
    return {
      pushEnabled: !!userData?.fcmToken && prefs.pushEnabled !== false,
      smsEnabled: prefs.smsEnabled !== false, // Default to enabled
      fcmToken: userData?.fcmToken,
    };
  } catch (error) {
    console.error('❌ Error getting notification preferences:', error);
    return { pushEnabled: false, smsEnabled: true };
  }
}

/**
 * Set SMS notification preference
 */
export async function setSMSNotificationPreference(userId: string, enabled: boolean): Promise<boolean> {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      'notificationPreferences.smsEnabled': enabled,
      'notificationPreferences.updatedAt': new Date(),
    });

    toast.success(`SMS notifications ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  } catch (error: any) {
    console.error('❌ Error updating SMS preference:', error);
    toast.error('Failed to update SMS notification preference');
    return false;
  }
}

/**
 * Listen for foreground push notifications
 */
export function onForegroundMessage(callback: (payload: any) => void): (() => void) | null {
  try {
    const messaging = getMessagingInstance();
    if (!messaging) return null;

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('📬 Foreground message received:', payload);
      callback(payload);
    });

    return unsubscribe;
  } catch (error) {
    console.error('❌ Error setting up foreground message listener:', error);
    return null;
  }
}

