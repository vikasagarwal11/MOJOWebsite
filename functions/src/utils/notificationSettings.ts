import { getFirestore } from 'firebase-admin/firestore';

export type NotificationSettingKey =
  | 'eventCreatedSms'
  | 'eventRsvp'
  | 'waitlistPromotion'
  | 'accountApproval'
  | 'accountRejection'
  | 'adminApprovalRequest'
  | 'contentModeration'
  | 'adminQuestion'
  | 'generalInApp'
  | 'eventReminders'
  | 'contentStatus'
  | 'adminNotifications';

export type NotificationSettings = Record<NotificationSettingKey, boolean>;

const DEFAULT_SETTINGS: NotificationSettings = {
  eventCreatedSms: true,
  eventRsvp: true,
  waitlistPromotion: true,
  accountApproval: true,
  accountRejection: true,
  adminApprovalRequest: true,
  contentModeration: true,
  adminQuestion: true,
  generalInApp: true,
  eventReminders: true,
  contentStatus: true,
  adminNotifications: true,
};

const db = getFirestore();
const SETTINGS_DOC = db.doc('appConfig/notificationSettings');
const CACHE_MS = 10_000;
let cache: { data: NotificationSettings; fetchedAt: number } | null = null;

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_MS) {
    return cache.data;
  }

  const snap = await SETTINGS_DOC.get();
  const data = snap.exists ? (snap.data() as Partial<NotificationSettings>) : {};
  const merged = { ...DEFAULT_SETTINGS, ...data } as NotificationSettings;
  const normalize = (value: unknown) =>
    value === false || value === 'false' || value === 0 || value === '0' ? false : true;
  const normalized: NotificationSettings = {
    ...merged,
    eventCreatedSms: normalize(merged.eventCreatedSms),
    eventRsvp: normalize(merged.eventRsvp),
    waitlistPromotion: normalize(merged.waitlistPromotion),
    accountApproval: normalize(merged.accountApproval),
    accountRejection: normalize(merged.accountRejection),
    adminApprovalRequest: normalize(merged.adminApprovalRequest),
    contentModeration: normalize(merged.contentModeration),
    adminQuestion: normalize(merged.adminQuestion),
    generalInApp: normalize(merged.generalInApp),
    eventReminders: normalize(merged.eventReminders),
    contentStatus: normalize(merged.contentStatus),
    adminNotifications: normalize(merged.adminNotifications),
  };
  cache = { data: normalized, fetchedAt: now };
  return normalized;
}

export async function isNotificationTypeEnabled(type: NotificationSettingKey): Promise<boolean> {
  const settings = await getNotificationSettings();
  return settings[type] !== false;
}
