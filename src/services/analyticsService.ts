import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export type AnalyticsEventType =
  | 'page_view'
  | 'event_click'
  | 'event_view'
  | 'media_open'
  | 'media_play'
  | 'payment_click'
  | 'payment_start'
  | 'payment_success'
  | 'button_click'
  | 'cta_click'
  | 'section_view';

export type AnalyticsUserType = 'guest' | 'member' | 'admin' | 'trainer' | 'anonymous';

export type AnalyticsPayload = {
  eventType: AnalyticsEventType;
  eventId?: string;
  mediaId?: string;
  page?: string;
  userId?: string;
  guestEmail?: string;
  userType?: AnalyticsUserType;
  metadata?: Record<string, any>;
};

const GA_MEASUREMENT_ID =
  import.meta.env.VITE_GA_MEASUREMENT_ID || import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;

const isPlaceholderMeasurementId = (value: string | undefined) =>
  !value || /^G-?X{4,}$/i.test(value) || value.includes('XXXX');

const isGaEnabled =
  typeof window !== 'undefined' && !isPlaceholderMeasurementId(GA_MEASUREMENT_ID);

const INTERNAL_ANALYTICS_ENABLED =
  (import.meta.env.PROD && import.meta.env.VITE_ENABLE_ANALYTICS !== 'false') ||
  import.meta.env.VITE_ENABLE_ANALYTICS === 'true';

const GA_EVENT_ALLOWLIST = new Set<AnalyticsEventType>([
  'event_click',
  'event_view',
  'media_open',
  'payment_click',
  'payment_success',
  'page_view',
  'button_click',
  'cta_click',
  'section_view',
]);

const DEDUPE_TTL_MS = 2500;
const dedupeMap = new Map<string, number>();

const getSessionId = () => {
  if (typeof window === 'undefined') return undefined;
  try {
    const key = 'mojo_analytics_session_id';
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const generated =
      (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    window.sessionStorage.setItem(key, generated);
    return generated;
  } catch {
    return undefined;
  }
};

const getVisitorType = () => {
  if (typeof window === 'undefined') return 'unknown';
  try {
    const key = 'mojo_returning_visitor';
    const existing = window.localStorage.getItem(key);
    if (existing) return 'returning';
    window.localStorage.setItem(key, '1');
    return 'new';
  } catch {
    return 'unknown';
  }
};

const getDeviceType = () => {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'mobile';
  return 'desktop';
};

const getOS = () => {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  if (/Windows NT/i.test(ua)) return 'Windows';
  if (/Mac OS X/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua)) return 'macOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'unknown';
};

const getBrowser = () => {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'Safari';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  return 'unknown';
};

const getReferrerHost = () => {
  if (typeof window === 'undefined') return undefined;
  try {
    if (!document.referrer) return undefined;
    return new URL(document.referrer).hostname || undefined;
  } catch {
    return undefined;
  }
};

const getUtmParams = () => {
  if (typeof window === 'undefined') return {};
  try {
    const params = new URLSearchParams(window.location.search);
    const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    const utm: Record<string, string> = {};
    keys.forEach((key) => {
      const value = params.get(key);
      if (value) utm[key] = value;
    });
    return utm;
  } catch {
    return {};
  }
};

const getTrafficSource = (referrerHost?: string, utmSource?: string) => {
  if (utmSource) return utmSource.toLowerCase();
  if (!referrerHost) return 'direct';
  const host = referrerHost.toLowerCase();
  if (host.includes('facebook.com') || host.includes('fb.com') || host.includes('l.facebook.com')) return 'facebook';
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('t.co') || host.includes('twitter.com') || host.includes('x.com')) return 'twitter';
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
  if (host.includes('linkedin.com')) return 'linkedin';
  if (host.includes('pinterest.com')) return 'pinterest';
  if (host.includes('whatsapp.com') || host.includes('wa.me')) return 'whatsapp';
  if (host.includes('google.com')) return 'google';
  if (host.includes('bing.com')) return 'bing';
  return referrerHost;
};

const shouldLog = (key: string) => {
  const now = Date.now();
  const last = dedupeMap.get(key);
  if (last && now - last < DEDUPE_TTL_MS) {
    return false;
  }
  dedupeMap.set(key, now);
  return true;
};

const sendGaEvent = (eventName: string, params: Record<string, any>) => {
  if (!isGaEnabled) return;
  const gtag = (window as any).gtag;
  if (typeof gtag !== 'function') return;
  try {
    gtag('event', eventName, params);
  } catch {
    // no-op: GA failures should never block UX
  }
};

const fireAndForget = (fn: () => Promise<void>) => {
  if (!INTERNAL_ANALYTICS_ENABLED) return;
  // Run async without blocking UI thread
  setTimeout(() => {
    fn().catch(() => {});
  }, 0);
};

const normalizeUserType = (payload: AnalyticsPayload): AnalyticsUserType => {
  if (payload.userType) return payload.userType;
  if (payload.userId) return 'member';
  if (payload.guestEmail) return 'guest';
  return 'anonymous';
};

export const logAnalyticsEvent = (payload: AnalyticsPayload) => {
  if (typeof window === 'undefined') return;

  const page = payload.page || window.location.pathname;
  const userType = normalizeUserType(payload);
  const referrerHost = getReferrerHost();
  const utm = getUtmParams();
  const trafficSource = getTrafficSource(referrerHost, utm.utm_source);
  const visitorType = getVisitorType();
  const deviceType = getDeviceType();
  const os = getOS();
  const browser = getBrowser();
  const dedupeKey = [
    payload.eventType,
    payload.eventId || '',
    payload.mediaId || '',
    page,
    payload.userId || '',
    payload.guestEmail || '',
    payload.metadata?.action || '',
  ].join('|');

  if (!shouldLog(dedupeKey)) return;

  const baseMeta = {
    page,
    userType,
    sessionId: getSessionId(),
    referrer: document.referrer || undefined,
    referrerHost,
    trafficSource,
    visitorType,
    deviceType,
    os,
    browser,
    ...utm,
  };

  if (GA_EVENT_ALLOWLIST.has(payload.eventType)) {
    const gaParams: Record<string, any> = {
      ...baseMeta,
      event_id: payload.eventId,
      media_id: payload.mediaId,
      event_name: payload.metadata?.eventTitle,
      media_name: payload.metadata?.mediaTitle,
      page_title: document.title,
      page_location: window.location.href,
      page_path: page,
      ...payload.metadata,
    };
    sendGaEvent(payload.eventType, gaParams);
  }

  fireAndForget(async () => {
    const collectionRef = collection(db, 'analytics');
    await addDoc(collectionRef, {
      eventType: payload.eventType,
      eventId: payload.eventId || null,
      mediaId: payload.mediaId || null,
      page,
      userId: payload.userId || null,
      guestEmail: payload.guestEmail || null,
      userType,
      timestamp: serverTimestamp(),
      metadata: {
        ...baseMeta,
        ...payload.metadata,
      },
    });
  });
};

export const logPageView = (
  pagePath: string,
  pageTitle?: string,
  context?: Pick<AnalyticsPayload, 'userId' | 'guestEmail' | 'userType'>
) => {
  if (typeof window === 'undefined') return;
  const page = pagePath || window.location.pathname;
  const utm = getUtmParams();
  const referrerHost = getReferrerHost();
  const trafficSource = getTrafficSource(referrerHost, utm.utm_source);
  const visitorType = getVisitorType();
  const deviceType = getDeviceType();
  const os = getOS();
  const browser = getBrowser();

  sendGaEvent('page_view', {
    page_title: pageTitle || document.title,
    page_location: window.location.href,
    page_path: page,
    ...utm,
  });

  logAnalyticsEvent({
    eventType: 'page_view',
    page,
    userId: context?.userId,
    guestEmail: context?.guestEmail,
    userType: context?.userType,
    metadata: {
      pageTitle: pageTitle || document.title,
      referrerHost,
      trafficSource,
      visitorType,
      deviceType,
      os,
      browser,
      ...utm,
    },
  });
};
