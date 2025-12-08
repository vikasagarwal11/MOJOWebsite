import { 
  collection, 
  addDoc, 
  query, 
  where, 
  updateDoc, 
  doc, 
  serverTimestamp,
  getDocs,
  getDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { getMessaging, MessagePayload } from 'firebase/messaging';
import app from '../config/firebase';

export interface Notification {
  id: string;
  userId: string;
  type: 'waitlist_promotion' | 'event_reminder' | 'rsvp_confirmation' | 'general' | 'content_approved' | 'content_rejected';
  title: string;
  message: string;
  eventId?: string;
  read: boolean;
  createdAt: any;
  expiresAt?: any;
  metadata?: any;
}

export interface CreateNotificationData {
  userId: string;
  type: Notification['type'];
  title: string;
  message: string;
  eventId?: string;
  expiresAt?: Date;
  metadata?: any;
}

class NotificationService {
  
  /**
   * Create a new notification
   */
  async createNotification(data: CreateNotificationData): Promise<string> {
    try {
      const notificationData = {
        ...data,
        read: false,
        createdAt: serverTimestamp(),
        expiresAt: data.expiresAt || null
      };

      const docRef = await addDoc(collection(db, 'notifications'), notificationData);
      console.log('✅ Notification created:', docRef.id);
      
      return docRef.id;
    } catch (error) {
      console.error('❌ Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true,
        readAt: serverTimestamp()
      });
      console.log('✅ Notification marked as read:', notificationId);
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Get user's unread notifications count
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        where('read', '==', false)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.size;
    } catch (error) {
      console.error('❌ Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Send multiple notifications simultaneously 
   * Uses Firebase Auth SMS for FREE SMS notifications!
   */
  async sendPromotionNotification(userId: string, promotionData: {
    userName: string;
    eventTitle: string;
    eventDate: string;
    eventId: string;
    originalPosition?: number;
    newPosition?: number;
  }): Promise<void> {
    try {
      const notificationTitle = '🎉 Waitlist Promotion Confirmed!';
      const notificationMessage = `You've been promoted from waitlist for "${promotionData.eventTitle}"`;
      
      // 1. Create in-app notification
      await this.createNotification({
        userId,
        type: 'waitlist_promotion',
        title: notificationTitle,
        message: notificationMessage,
        eventId: promotionData.eventId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        metadata: {
          originalPosition: promotionData.originalPosition,
          newPosition: promotionData.newPosition,
          promotionTime: new Date().toISOString()
        }
      });

      // 2. Send browser push notification (if FCM token available)
      await this.sendBrowserPushNotification(userId, {
        title: notificationTitle,
        body: notificationMessage,
        data: {
          eventId: promotionData.eventId,
          type: 'promotion'
        }
      });

      // 3. SMS notifications are handled by Cloud Functions (sendPromotionNotifications)
      // This frontend service should NOT queue SMS directly - it's done server-side
      // to respect user preferences and use the proper queue system

      // 4. Mark user for popup alert on next visit
      await this.markForPopupAlert(userId, {
        type: 'promotion',
        title: notificationTitle,
        message: notificationMessage,
        eventId: promotionData.eventId
      });

      console.log('✅ All promotion notifications sent successfully');
    } catch (error) {
      console.error('❌ Error sending promotion notifications:', error);
      throw error;
    }
  }

  /**
   * Send browser push notification via FCM
   * Checks user preferences before sending
   */
  private async sendBrowserPushNotification(userId: string, payload: any): Promise<void> {
    try {
      // Check if push notifications are enabled for this user
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) {
        console.log('ℹ️ User not found for push notification:', userId);
        return;
      }

      const userData = userDoc.data();
      const fcmToken = userData?.fcmToken;
      const pushEnabled = userData?.notificationPreferences?.pushEnabled !== false; // Default to true if not set
      
      // Check if push is enabled
      if (!pushEnabled) {
        console.log('ℹ️ Push notifications disabled for user:', userId);
        return;
      }

      if (!fcmToken) {
        console.log('ℹ️ No FCM token for user', userId);
        return;
      }

      const messaging = getMessaging(app);
      
      // Add to push notification queue for Cloud Functions to process
      await addDoc(collection(db, 'push_notification_queue'), {
        userId: userId,
        fcmToken: fcmToken,
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        createdAt: serverTimestamp()
      });
      
      console.log('✅ Browser push queued for', userId);
    } catch (error) {
      console.error('❌ Error queuing browser push:', error);
    }
  }

  /**
   * Get user's FCM token for push notifications
   */
  private async getUserFCMToken(userId: string): Promise<string | null> {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      return userDoc.data()?.fcmToken || null;
    } catch (error) {
      console.error('❌ Error getting FCM token:', error);
      return null;
    }
  }

  /**
   * Mark user for popup alert on next website visit
   */
  private async markForPopupAlert(userId: string, alertData: any): Promise<void> {
    try {
      await addDoc(collection(db, 'popup_alerts'), {
        userId,
        ...alertData,
        createdAt: serverTimestamp(),
        acknowledged: false
      });
      console.log('✅ Popup alert marked for user:', userId);
    } catch (error) {
      console.error('❌ Error marking popup alert:', error);
    }
  }
}

export const notificationService = new NotificationService();
