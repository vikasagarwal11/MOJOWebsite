import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, limit } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../config/firebase';
import { Bell, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface Notification {
  id: string;
  userId: string;
  type: 'waitlist_promotion' | 'event_reminder' | 'rsvp_confirmation' | 'general' | 'account_approval_request' | 'account_approved' | 'approval_question' | 'approval_response' | 'content_approved' | 'content_rejected';
  title: string;
  message: string;
  eventId?: string;
  read: boolean;
  createdAt: any;
  expiresAt?: any;
  metadata?: any;
}

interface NotificationCenterProps {
  userId: string;
  onNavigateToEvent?: (eventId: string) => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ userId, onNavigateToEvent }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const NOTIFICATION_LIMIT = 50; // Limit to most recent 50 notifications for performance

  useEffect(() => {
    if (!userId) return;

    const unsubscribe = onSnapshot(
      query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(NOTIFICATION_LIMIT) // Add pagination limit
      ),
      (snapshot) => {
        const updatedNotifications = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Notification[];
        
        setNotifications(updatedNotifications);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading notifications:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (notificationId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true,
        readAt: new Date()
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      // Use server-side callable to mark all notifications as read
      // This is more efficient than loading all notifications client-side
      const functions = getFunctions(undefined, 'us-east1');
      const markAllAsReadCallable = httpsCallable(functions, 'markAllNotificationsAsRead');
      
      const result = await markAllAsReadCallable();
      const data = result.data as { success: boolean; count: number; message: string };
      
      if (data.success) {
        toast.success(data.message || 'All notifications marked as read');
        console.log(`✅ Marked ${data.count} notifications as read`);
      } else {
        toast.error('Failed to mark all notifications as read');
      }
    } catch (error: any) {
      console.error('Error marking all notifications as read:', error);
      toast.error(error?.message || 'Failed to mark all notifications as read');
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    if (!notification.read) {
      await markAsRead(notification.id);
    }

    // Navigate to event if applicable
    if (notification.eventId && onNavigateToEvent) {
      onNavigateToEvent(notification.eventId);
    }

    // Navigate to account approval page if it's an approval-related notification
    if (notification.metadata?.approvalId) {
      if (notification.type === 'account_approval_request' || notification.type === 'approval_response') {
        // Admin notifications - navigate to admin console
        window.location.href = '/admin';
      } else if (notification.type === 'account_approved') {
        // User approved - navigate to home
        window.location.href = '/';
      } else if (notification.type === 'approval_question') {
        // Admin question - navigate to pending approval page
        window.location.href = '/pending-approval';
      }
    }

    // Close notification center
    setIsOpen(false);
  };

  const formatTimeAgo = (timestamp: any): string => {
    if (!timestamp) return 'Unknown';
    
    const now = new Date();
    const notificationTime = timestamp instanceof Date 
      ? timestamp 
      : timestamp?.toDate?.() || new Date(timestamp);
    const diffInMinutes = Math.floor((now.getTime() - notificationTime.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
  };

  const getNotificationIcon = (type: Notification['type']): string => {
    switch (type) {
      case 'waitlist_promotion':
        return '🎉';
      case 'event_reminder':
        return '🔔';
      case 'rsvp_confirmation':
        return '✅';
      case 'account_approval_request':
        return '👤';
      case 'account_approved':
        return '🎉';
      case 'approval_question':
        return '❓';
      case 'approval_response':
        return '💬';
      default:
        return '📢';
    }
  };

  const getNotificationColor = (type: Notification['type']): string => {
    switch (type) {
      case 'waitlist_promotion':
        return 'border-green-500 bg-green-50';
      case 'event_reminder':
        return 'border-blue-500 bg-blue-50';
      case 'rsvp_confirmation':
        return 'border-purple-500 bg-purple-50';
      case 'account_approval_request':
        return 'border-orange-500 bg-orange-50';
      case 'account_approved':
        return 'border-green-500 bg-green-50';
      case 'approval_question':
        return 'border-yellow-500 bg-yellow-50';
      case 'approval_response':
        return 'border-blue-500 bg-blue-50';
      default:
        return 'border-gray-500 bg-gray-50';
    }
  };

  if (!userId) return null;

  return (
    <div className="relative">
      {/* Notification Bell */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-6 h-6 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-80 bg-white shadow-lg rounded-lg border border-gray-200 z-50 max-h-96 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">
                  Notifications {unreadCount > 0 && `(${unreadCount} unread)`}
                </h3>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 hover:bg-gray-200 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-64 overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-gray-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto"></div>
                  <p className="mt-2">Loading notifications...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Bell className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No notifications yet</p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`p-4 border-l-4 ${getNotificationColor(notification.type)} ${
                      !notification.read ? 'bg-white' : 'bg-gray-50'
                    } hover:bg-gray-100 cursor-pointer transition-colors`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-lg mt-0.5">
                        {getNotificationIcon(notification.type)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-semibold ${
                            !notification.read ? 'text-gray-900' : 'text-gray-700'
                          }`}>
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatTimeAgo(notification.createdAt)}
                        </p>
                        
                        {/* Action buttons */}
                        {notification.eventId && (
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNotificationClick(notification);
                              }}
                              className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600 transition-colors"
                            >
                              View Event
                            </button>
                            {notification.type === 'waitlist_promotion' && (
                              <span className="text-xs bg-green-500 text-white px-2 py-1 rounded">
                                Promotion
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="p-3 border-t border-gray-200 bg-gray-50 text-center">
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-xs text-gray-600 hover:text-gray-800"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationCenter;
