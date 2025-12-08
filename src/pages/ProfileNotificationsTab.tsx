import React, { useState, useEffect } from 'react';
import { Bell, Smartphone, Mail, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  enablePushNotifications,
  disablePushNotifications,
  getNotificationPreferences,
  setSMSNotificationPreference,
  isPushNotificationsEnabled,
} from '../services/fcmTokenService';
import toast from 'react-hot-toast';

interface ProfileNotificationsTabProps {
  userId: string;
}

export const ProfileNotificationsTab: React.FC<ProfileNotificationsTabProps> = ({ userId }) => {
  const { currentUser } = useAuth();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [browserSupport, setBrowserSupport] = useState(true);

  useEffect(() => {
    loadPreferences();
    checkBrowserSupport();
  }, [userId]);

  const checkBrowserSupport = () => {
    const supportsNotifications = 'Notification' in window;
    const supportsServiceWorker = 'serviceWorker' in navigator;
    setBrowserSupport(supportsNotifications && supportsServiceWorker);
  };

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const prefs = await getNotificationPreferences(userId);
      setPushEnabled(prefs.pushEnabled);
      setSmsEnabled(prefs.smsEnabled);
    } catch (error) {
      console.error('Error loading notification preferences:', error);
      toast.error('Failed to load notification preferences');
    } finally {
      setLoading(false);
    }
  };

  const handlePushToggle = async (enabled: boolean) => {
    if (!browserSupport) {
      toast.error('Your browser does not support push notifications');
      return;
    }

    setUpdating(true);
    try {
      let success = false;
      
      if (enabled) {
        success = await enablePushNotifications(userId);
        if (success) {
          setPushEnabled(true);
        }
      } else {
        success = await disablePushNotifications(userId);
        if (success) {
          setPushEnabled(false);
        }
      }

      // Reload preferences to ensure sync
      if (success) {
        await loadPreferences();
      }
    } catch (error: any) {
      console.error('Error toggling push notifications:', error);
      toast.error(error?.message || 'Failed to update push notification preference');
    } finally {
      setUpdating(false);
    }
  };

  const handleSMSToggle = async (enabled: boolean) => {
    setUpdating(true);
    try {
      const success = await setSMSNotificationPreference(userId, enabled);
      if (success) {
        setSmsEnabled(enabled);
      }
    } catch (error: any) {
      console.error('Error toggling SMS notifications:', error);
      toast.error('Failed to update SMS notification preference');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-[#F25129]" />
      </div>
    );
  }

  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Notification Preferences</h2>
        <p className="text-sm text-gray-600">
          Control how you receive notifications from Moms Fitness Mojo
        </p>
      </div>

      {/* Browser Push Notifications */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Bell className="w-5 h-5 text-[#F25129]" />
              <h3 className="text-lg font-medium text-gray-900">Browser Push Notifications</h3>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              Receive notifications even when the browser is closed or the tab is inactive
            </p>
            <div className="text-xs text-gray-500">
              {pushEnabled ? (
                <span className="text-green-600">✅ Currently enabled</span>
              ) : (
                <span className="text-gray-500">❌ Currently disabled</span>
              )}
              {isAdmin && (
                <span className="ml-2 text-blue-600">(Admin: SMS fallback enabled)</span>
              )}
            </div>
            {!browserSupport && (
              <p className="text-xs text-red-600 mt-2">
                ⚠️ Your browser does not support push notifications
              </p>
            )}
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={pushEnabled}
              onChange={(e) => handlePushToggle(e.target.checked)}
              disabled={updating || !browserSupport}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#F25129]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-[#F25129] peer-checked:to-[#FFC107] disabled:opacity-50 disabled:cursor-not-allowed" />
          </label>
        </div>
      </div>

      {/* SMS Notifications */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Smartphone className="w-5 h-5 text-[#F25129]" />
              <h3 className="text-lg font-medium text-gray-900">SMS Notifications</h3>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              Receive important updates via SMS to your registered phone number
            </p>
            <div className="text-xs text-gray-500">
              {smsEnabled ? (
                <span className="text-green-600">✅ Currently enabled</span>
              ) : (
                <span className="text-gray-500">❌ Currently disabled</span>
              )}
              {isAdmin && (
                <span className="ml-2 text-blue-600">(Used as fallback when push fails)</span>
              )}
            </div>
            {currentUser?.phoneNumber && (
              <p className="text-xs text-gray-500 mt-1">
                Phone: {currentUser.phoneNumber}
              </p>
            )}
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={smsEnabled}
              onChange={(e) => handleSMSToggle(e.target.checked)}
              disabled={updating}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#F25129]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-[#F25129] peer-checked:to-[#FFC107] disabled:opacity-50 disabled:cursor-not-allowed" />
          </label>
        </div>
      </div>

      {/* Email Notifications - Coming Soon */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 opacity-60">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Mail className="w-5 h-5 text-gray-400" />
              <h3 className="text-lg font-medium text-gray-600">Email Notifications</h3>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Coming Soon</span>
            </div>
            <p className="text-sm text-gray-500 mb-2">
              Receive notifications via email (coming in a future update)
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-not-allowed">
            <input
              type="checkbox"
              disabled
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-400" />
          </label>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">How Notifications Work</h4>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>
            <strong>Push Notifications:</strong> Appear as browser notifications even when you're not on the site
          </li>
          <li>
            <strong>SMS Notifications:</strong> Sent to your registered phone number for important updates
          </li>
          {isAdmin && (
            <li className="font-medium">
              <strong>Admin:</strong> SMS is automatically used as backup if push notifications fail
            </li>
          )}
          <li>
            <strong>In-App Notifications:</strong> Always shown in the notification center (no preference needed)
          </li>
        </ul>
      </div>
    </div>
  );
};

