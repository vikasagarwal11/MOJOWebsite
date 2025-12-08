import { useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getFCMToken, onForegroundMessage } from '../../services/fcmTokenService';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import toast from 'react-hot-toast';

/**
 * PushNotificationInitializer
 * 
 * Automatically initializes push notifications when user logs in:
 * 1. Checks if browser permission is already granted
 * 2. If yes, automatically gets FCM token and stores it
 * 3. Sets up foreground message listener
 * 4. Logs diagnostic information
 */
export const PushNotificationInitializer: React.FC = () => {
  const { currentUser } = useAuth();
  const initializedRef = useRef(false);
  const foregroundListenerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!currentUser?.id || initializedRef.current) return;

    const initializePushNotifications = async () => {
      try {
        console.log('🔔 PushNotificationInitializer: Starting initialization for user:', currentUser.id);

        // Check if browser supports notifications
        if (!('Notification' in window)) {
          console.warn('⚠️ PushNotificationInitializer: Browser does not support notifications');
          return;
        }

        if (!('serviceWorker' in navigator)) {
          console.warn('⚠️ PushNotificationInitializer: Service Worker not supported');
          return;
        }

        // Check current permission status
        const permission = Notification.permission;
        console.log('🔔 PushNotificationInitializer: Current notification permission:', permission);

        // Check if user already has FCM token
        const userRef = doc(db, 'users', currentUser.id);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        const existingToken = userData?.fcmToken;
        const pushEnabled = userData?.notificationPreferences?.pushEnabled !== false; // Default to true

        console.log('🔔 PushNotificationInitializer: User push status:', {
          hasToken: !!existingToken,
          pushEnabled,
          permission
        });

        // If permission is already granted and no token exists, get one automatically
        if (permission === 'granted' && !existingToken && pushEnabled) {
          console.log('🔔 PushNotificationInitializer: Permission granted, no token found - getting FCM token...');
          
          const token = await getFCMToken();
          
          if (token) {
            console.log('✅ PushNotificationInitializer: FCM token obtained automatically');
            
            // Store token in user document
            await updateDoc(userRef, {
              fcmToken: token,
              'notificationPreferences.pushEnabled': true,
              'notificationPreferences.updatedAt': new Date(),
            });
            
            console.log('✅ PushNotificationInitializer: FCM token stored in user document');
          } else {
            console.warn('⚠️ PushNotificationInitializer: Failed to get FCM token (VAPID_KEY might be missing)');
          }
        } else if (permission === 'granted' && existingToken) {
          console.log('✅ PushNotificationInitializer: User already has FCM token');
        } else if (permission === 'default') {
          console.log('ℹ️ PushNotificationInitializer: Permission not yet requested - user can enable in Profile → Notifications');
        } else if (permission === 'denied') {
          console.log('ℹ️ PushNotificationInitializer: Permission denied - user can enable in browser settings');
        }

        // Set up foreground message listener (for when app is open)
        const unsubscribe = onForegroundMessage((payload) => {
          console.log('📬 PushNotificationInitializer: Foreground message received:', payload);
          
          // Show notification even when app is in foreground
          if (payload.notification) {
            const notificationTitle = payload.notification.title || 'New Notification';
            const notificationBody = payload.notification.body || '';
            
            // Show browser notification
            if (Notification.permission === 'granted') {
              new Notification(notificationTitle, {
                body: notificationBody,
                icon: payload.notification.icon || '/favicon.ico',
                badge: '/favicon.ico',
                tag: payload.data?.notificationId || 'default',
                requireInteraction: false,
              });
            }
            
            // Also show toast notification
            toast.success(notificationTitle, {
              description: notificationBody,
              duration: 5000,
            });
          }
        });

        if (unsubscribe) {
          foregroundListenerRef.current = unsubscribe;
          console.log('✅ PushNotificationInitializer: Foreground message listener set up');
        } else {
          console.warn('⚠️ PushNotificationInitializer: Failed to set up foreground message listener');
        }

        initializedRef.current = true;
      } catch (error: any) {
        console.error('❌ PushNotificationInitializer: Error initializing push notifications:', error);
      }
    };

    // Small delay to ensure user document is loaded
    const timeoutId = setTimeout(initializePushNotifications, 1000);

    return () => {
      clearTimeout(timeoutId);
      if (foregroundListenerRef.current) {
        foregroundListenerRef.current();
        foregroundListenerRef.current = null;
      }
    };
  }, [currentUser?.id]);

  // Reset when user logs out
  useEffect(() => {
    if (!currentUser) {
      initializedRef.current = false;
      if (foregroundListenerRef.current) {
        foregroundListenerRef.current();
        foregroundListenerRef.current = null;
      }
    }
  }, [currentUser]);

  return null; // This component doesn't render anything
};
