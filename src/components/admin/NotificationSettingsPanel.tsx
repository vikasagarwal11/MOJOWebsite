import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getNotificationSettings,
  updateNotificationSettings,
  type NotificationSettings,
} from '../../services/notificationSettingsService';
import toast from 'react-hot-toast';

type SettingItem = {
  key: keyof NotificationSettings;
  label: string;
  description: string;
};

const USER_SETTINGS: SettingItem[] = [
  {
    key: 'eventCreatedSms',
    label: 'Event Created SMS',
    description: 'SMS broadcast to approved users when a new event is created.',
  },
  {
    key: 'waitlistPromotion',
    label: 'Waitlist Promotion',
    description: 'In-app + push + SMS promotion notifications to waitlisted users.',
  },
  {
    key: 'accountApproval',
    label: 'Account Approval',
    description: 'Notify users when their account is approved.',
  },
  {
    key: 'accountRejection',
    label: 'Account Rejection',
    description: 'Notify users when their account is rejected.',
  },
  {
    key: 'eventReminders',
    label: 'Event Reminders',
    description: 'Reminder-style notifications tied to events.',
  },
  {
    key: 'contentStatus',
    label: 'Content Status Updates',
    description: 'Notify user when content is approved/rejected.',
  },
  {
    key: 'generalInApp',
    label: 'General In-App Notifications',
    description: 'General in-app notifications across the app.',
  },
];

const ADMIN_SETTINGS: SettingItem[] = [
  {
    key: 'adminNotifications',
    label: 'Admin Notifications (Master)',
    description: 'Master toggle for admin-only notifications (in-app + push + SMS fallback).',
  },
  {
    key: 'eventRsvp',
    label: 'Event RSVP Notifications',
    description: 'Notify event creators when someone RSVPs to their event.',
  },
  {
    key: 'adminApprovalRequest',
    label: 'Admin Approval Requests',
    description: 'Notify admins when new approval requests are submitted.',
  },
  {
    key: 'contentModeration',
    label: 'Content Moderation Alerts',
    description: 'Notify admins when content requires moderation.',
  },
  {
    key: 'adminQuestion',
    label: 'Admin Question SMS',
    description: 'SMS when an admin asks a user a question (non-OTP).',
  },
];

const NotificationSettingsPanel: React.FC = () => {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const userSettings = useMemo(() => USER_SETTINGS, []);
  const adminSettings = useMemo(() => ADMIN_SETTINGS, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await getNotificationSettings();
        if (active) setSettings(data);
      } catch (err: any) {
        console.error('[NotificationSettingsPanel] Failed to load settings', err);
        toast.error('Failed to load notification settings.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const handleToggle = async (key: keyof NotificationSettings, value: boolean) => {
    if (!currentUser) return;
    try {
      setSavingKey(String(key));
      setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
      await updateNotificationSettings({ [key]: value } as Partial<NotificationSettings>, currentUser.id);
      toast.success('Notification settings updated.');
    } catch (err: any) {
      console.error('[NotificationSettingsPanel] Failed to update setting', err);
      toast.error('Failed to update notification settings.');
      const data = await getNotificationSettings();
      setSettings(data);
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return <p className="text-gray-600">Loading notification settings...</p>;
  }

  if (!settings) {
    return <p className="text-gray-600">No settings available.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-gray-900">Notification Controls</h2>
        <p className="text-sm text-gray-600 mt-1">
          Toggle system-wide notifications without changing environment variables. OTP messages are always enabled.
        </p>
      </div>

      <div className="space-y-6">
        <div className="space-y-3">
          <div className="text-sm font-semibold text-gray-900">User Notifications</div>
          {userSettings.map((item) => {
            const value = settings[item.key] !== false;
            const isSaving = savingKey === item.key;
            return (
              <div key={item.key} className="rounded-xl border border-gray-200 bg-white p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{item.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{item.description}</div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-xs text-gray-500">{value ? 'On' : 'Off'}</span>
                  <input
                    type="checkbox"
                    checked={value}
                    disabled={isSaving}
                    onChange={(e) => handleToggle(item.key, e.target.checked)}
                    className="w-5 h-5 text-[#F25129] rounded"
                  />
                </label>
              </div>
            );
          })}
        </div>

        <div className="space-y-3">
          <div className="text-sm font-semibold text-gray-900">Admin Notifications</div>
          {adminSettings.map((item) => {
            const value = settings[item.key] !== false;
            const isSaving = savingKey === item.key;
            return (
              <div key={item.key} className="rounded-xl border border-gray-200 bg-white p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{item.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{item.description}</div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-xs text-gray-500">{value ? 'On' : 'Off'}</span>
                  <input
                    type="checkbox"
                    checked={value}
                    disabled={isSaving}
                    onChange={(e) => handleToggle(item.key, e.target.checked)}
                    className="w-5 h-5 text-[#F25129] rounded"
                  />
                </label>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default NotificationSettingsPanel;
