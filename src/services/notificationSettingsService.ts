import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export type NotificationSettings = {
  eventCreatedSms: boolean;
  eventRsvp: boolean;
  waitlistPromotion: boolean;
  accountApproval: boolean;
  accountRejection: boolean;
  adminApprovalRequest: boolean;
  contentModeration: boolean;
  adminQuestion: boolean;
  generalInApp: boolean;
  eventReminders: boolean;
  contentStatus: boolean;
  updatedAt?: any;
  updatedBy?: string;
};

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
};

const SETTINGS_DOC = doc(db, 'appConfig', 'notificationSettings');
let cached: { data: NotificationSettings; fetchedAt: number } | null = null;
const CACHE_MS = 30_000;

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CACHE_MS) {
    return cached.data;
  }

  const snap = await getDoc(SETTINGS_DOC);
  const data = snap.exists() ? (snap.data() as Partial<NotificationSettings>) : {};
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
    updatedAt: merged.updatedAt,
    updatedBy: merged.updatedBy,
  };
  cached = { data: normalized, fetchedAt: now };
  return normalized;
}

export async function updateNotificationSettings(
  partial: Partial<NotificationSettings>,
  userId: string
): Promise<void> {
  await setDoc(
    SETTINGS_DOC,
    {
      ...partial,
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    },
    { merge: true }
  );
  cached = null;
}

export async function isInAppNotificationEnabled(
  type: 'waitlist_promotion' | 'event_reminder' | 'rsvp_confirmation' | 'general' | 'content_approved' | 'content_rejected'
): Promise<boolean> {
  const settings = await getNotificationSettings();
  const map: Record<string, keyof NotificationSettings> = {
    waitlist_promotion: 'waitlistPromotion',
    event_reminder: 'eventReminders',
    rsvp_confirmation: 'eventRsvp',
    general: 'generalInApp',
    content_approved: 'contentStatus',
    content_rejected: 'contentStatus',
  };
  const key = map[type] || 'generalInApp';
  return settings[key] !== false;
}
