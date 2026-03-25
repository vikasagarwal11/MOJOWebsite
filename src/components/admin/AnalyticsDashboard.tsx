import { BarChart3, CalendarDays, Filter, Loader2 } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';

type RangeKey = 'today' | 'week' | 'month';

type AnalyticsDoc = {
  id: string;
  eventType?: string;
  eventId?: string | null;
  mediaId?: string | null;
  page?: string | null;
  userId?: string | null;
  guestEmail?: string | null;
  userType?: string | null;
  timestamp?: any;
  metadata?: Record<string, any>;
};

const rangeOptions: { key: RangeKey; label: string; days: number }[] = [
  { key: 'today', label: 'Today', days: 1 },
  { key: 'week', label: 'Last 7 Days', days: 7 },
  { key: 'month', label: 'Last 30 Days', days: 30 },
];

const getRangeStart = (range: RangeKey) => {
  const now = new Date();
  const option = rangeOptions.find(r => r.key === range) || rangeOptions[1];
  const daysBack = option.days - 1;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - daysBack);
  return start;
};

const formatLabel = (value?: string, fallback = 'Unknown') => {
  if (!value) return fallback;
  return value.length > 34 ? `${value.slice(0, 31)}...` : value;
};

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
};

export const AnalyticsDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [range, setRange] = useState<RangeKey>('week');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AnalyticsDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (!isAdmin) {
        if (isMounted) {
          setRows([]);
          setError('Admin access required to view analytics.');
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      setError(null);

      try {
        const startDate = getRangeStart(range);
        const q = query(
          collection(db, 'analytics'),
          where('timestamp', '>=', Timestamp.fromDate(startDate)),
          orderBy('timestamp', 'desc')
        );
        const snap = await getDocs(q);
        if (!isMounted) return;
        setRows(
          snap.docs.map(doc => ({
            id: doc.id,
            ...(doc.data() as AnalyticsDoc),
          }))
        );
      } catch (err: any) {
        if (import.meta.env.DEV) {
          console.error('[AnalyticsDashboard] Failed to load analytics', err);
        }
        const isPermissionDenied =
          err?.code === 'permission-denied' ||
          String(err?.message || '').toLowerCase().includes('missing or insufficient permissions');
        if (isMounted) {
          setError(
            isPermissionDenied
              ? 'Admin access required. Ensure your user document has role "admin" in Firestore and re-login.'
              : (err?.message || 'Failed to load analytics')
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [range, isAdmin]);

  const totals = useMemo(() => {
    const totalPageViews = rows.filter(r => r.eventType === 'page_view').length;
    const uniqueSessions = new Set(
      rows
        .map(r => r.metadata?.sessionId)
        .filter((id: string | undefined) => !!id)
    ).size;
    const homePageViews = rows.filter(r => r.eventType === 'page_view' && (r.page === '/' || r.page === '/home')).length;
    const totalEventViews = rows.filter(r => r.eventType === 'event_view').length;
    const totalEventClicks = rows.filter(r => r.eventType === 'event_click').length;
    const totalMediaOpens = rows.filter(r => r.eventType === 'media_open').length;
    const totalPaymentClicks = rows.filter(r => r.eventType === 'payment_click').length;
    const totalPaymentSuccess = rows.filter(r => r.eventType === 'payment_success').length;
    return {
      totalPageViews,
      uniqueSessions,
      homePageViews,
      totalEventViews,
      totalEventClicks,
      totalMediaOpens,
      totalPaymentClicks,
      totalPaymentSuccess,
    };
  }, [rows]);

  const eventPopularity = useMemo(() => {
    const map = new Map<string, { id: string; title: string; views: number; clicks: number }>();
    rows.forEach((row) => {
      const eventId = row.eventId || row.metadata?.eventId || 'unknown';
      const title = row.metadata?.eventTitle || row.metadata?.event_name || eventId || 'Unknown Event';
      const existing = map.get(eventId) || { id: eventId, title, views: 0, clicks: 0 };
      if (row.eventType === 'event_view') existing.views += 1;
      if (row.eventType === 'event_click') existing.clicks += 1;
      map.set(eventId, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.views - a.views);
  }, [rows]);

  const mediaEngagement = useMemo(() => {
    const map = new Map<string, { id: string; title: string; opens: number }>();
    rows.forEach((row) => {
      if (row.eventType !== 'media_open') return;
      const mediaId = row.mediaId || row.metadata?.mediaId || 'unknown';
      const title = row.metadata?.mediaTitle || row.metadata?.media_name || mediaId || 'Unknown Media';
      const existing = map.get(mediaId) || { id: mediaId, title, opens: 0 };
      existing.opens += 1;
      map.set(mediaId, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.opens - a.opens);
  }, [rows]);

  const trafficSources = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => {
      if (row.eventType !== 'page_view') return;
      const source =
        row.metadata?.trafficSource ||
        row.metadata?.utm_source ||
        row.metadata?.referrerHost ||
        'direct';
      const key = typeof source === 'string' ? source.toLowerCase() : 'direct';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const socialSources = useMemo(() => {
    const socialSet = new Set([
      'facebook',
      'instagram',
      'twitter',
      'x',
      'youtube',
      'linkedin',
      'pinterest',
      'whatsapp',
    ]);
    return trafficSources.filter((item) => {
      const key = item.source.toLowerCase();
      return socialSet.has(key) || key.includes('facebook') || key.includes('instagram');
    });
  }, [trafficSources]);

  const eventConversion = useMemo(() => {
    const map = new Map<string, { id: string; title: string; views: number; clicks: number; success: number }>();
    rows.forEach((row) => {
      const eventId = row.eventId || row.metadata?.eventId || 'unknown';
      const title = row.metadata?.eventTitle || row.metadata?.event_name || eventId || 'Unknown Event';
      const existing = map.get(eventId) || { id: eventId, title, views: 0, clicks: 0, success: 0 };
      if (row.eventType === 'event_view') existing.views += 1;
      if (row.eventType === 'payment_click') existing.clicks += 1;
      if (row.eventType === 'payment_success') existing.success += 1;
      map.set(eventId, existing);
    });
    return Array.from(map.values())
      .map((item) => ({
        ...item,
        conversion: item.views ? Math.round((item.success / item.views) * 100) : 0,
      }))
      .sort((a, b) => b.success - a.success);
  }, [rows]);

  const trafficQuality = useMemo(() => {
    const map = new Map<string, { source: string; clicks: number; success: number }>();
    rows.forEach((row) => {
      if (row.eventType !== 'payment_click' && row.eventType !== 'payment_success') return;
      const source =
        row.metadata?.trafficSource ||
        row.metadata?.utm_source ||
        row.metadata?.referrerHost ||
        'direct';
      const key = typeof source === 'string' ? source.toLowerCase() : 'direct';
      const existing = map.get(key) || { source: key, clicks: 0, success: 0 };
      if (row.eventType === 'payment_click') existing.clicks += 1;
      if (row.eventType === 'payment_success') existing.success += 1;
      map.set(key, existing);
    });
    return Array.from(map.values())
      .map(item => ({
        ...item,
        conversion: item.clicks ? Math.round((item.success / item.clicks) * 100) : 0,
      }))
      .sort((a, b) => b.conversion - a.conversion);
  }, [rows]);

  const deviceSplit = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => {
      if (row.eventType !== 'page_view') return;
      const device = row.metadata?.deviceType || 'unknown';
      map.set(device, (map.get(device) || 0) + 1);
    });
    return Array.from(map.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }, [rows]);

  const browserSplit = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => {
      if (row.eventType !== 'page_view') return;
      const browser = row.metadata?.browser || 'unknown';
      map.set(browser, (map.get(browser) || 0) + 1);
    });
    return Array.from(map.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }, [rows]);

  const visitorSplit = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => {
      if (row.eventType !== 'page_view') return;
      const visitor = row.metadata?.visitorType || 'unknown';
      map.set(visitor, (map.get(visitor) || 0) + 1);
    });
    return Array.from(map.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }, [rows]);

  const timeOfDay = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
    rows.forEach((row) => {
      if (row.eventType !== 'page_view') return;
      const date = toDate(row.timestamp);
      if (!date) return;
      hours[date.getHours()].count += 1;
    });
    return hours;
  }, [rows]);

  const dayOfWeek = useMemo(() => {
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = labels.map((label) => ({ label, count: 0 }));
    rows.forEach((row) => {
      if (row.eventType !== 'page_view') return;
      const date = toDate(row.timestamp);
      if (!date) return;
      days[date.getDay()].count += 1;
    });
    return days;
  }, [rows]);

  const eventInterest = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => {
      if (row.eventType !== 'event_view') return;
      const category = row.metadata?.eventCategory || 'uncategorized';
      map.set(category, (map.get(category) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const landingSectionPerformance = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => {
      if (row.eventType !== 'event_click') return;
      const section = row.metadata?.landingSection;
      if (!section) return;
      map.set(section, (map.get(section) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([section, count]) => ({ section, count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const ctaStats = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => {
      if (row.eventType !== 'cta_click') return;
      const label = row.metadata?.label || 'Unknown CTA';
      const section = row.metadata?.section || 'unknown';
      const key = `${label} (${section})`;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const abandonedPayments = useMemo(() => {
    const map = new Map<string, { eventId: string; clicks: number; success: number }>();
    rows.forEach((row) => {
      if (row.eventType !== 'payment_click' && row.eventType !== 'payment_success') return;
      const sessionId = row.metadata?.sessionId || 'unknown';
      const eventId = row.eventId || row.metadata?.eventId || 'unknown';
      const key = `${eventId}::${sessionId}`;
      const existing = map.get(key) || { eventId, clicks: 0, success: 0 };
      if (row.eventType === 'payment_click') existing.clicks += 1;
      if (row.eventType === 'payment_success') existing.success += 1;
      map.set(key, existing);
    });
    let totalAbandoned = 0;
    const byEvent = new Map<string, number>();
    map.forEach((entry) => {
      const abandoned = Math.max(0, entry.clicks - entry.success);
      totalAbandoned += abandoned;
      byEvent.set(entry.eventId, (byEvent.get(entry.eventId) || 0) + abandoned);
    });
    return {
      totalAbandoned,
      byEvent: Array.from(byEvent.entries())
        .map(([eventId, count]) => ({ eventId, count }))
        .sort((a, b) => b.count - a.count),
    };
  }, [rows]);

  const funnel = useMemo(() => {
    const eventViews = rows.filter(r => r.eventType === 'event_view').length;
    const paymentClicks = rows.filter(r => r.eventType === 'payment_click').length;
    const paymentSuccess = rows.filter(r => r.eventType === 'payment_success').length;
    const max = Math.max(eventViews, paymentClicks, paymentSuccess, 1);
    return [
      { label: 'Event Page View', count: eventViews, width: (eventViews / max) * 100 },
      { label: 'Payment Click', count: paymentClicks, width: (paymentClicks / max) * 100 },
      { label: 'Payment Success', count: paymentSuccess, width: (paymentSuccess / max) * 100 },
    ];
  }, [rows]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF5F2] via-white to-[#FFF9F7]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#F25129]/10 bg-white/80 backdrop-blur p-5 shadow-sm">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Analytics Dashboard</h2>
            <p className="text-sm text-gray-600">Live engagement insights for MomsFitnessMojo.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#F25129]/10 px-3 py-1 text-xs font-semibold text-[#F25129]">
              <Filter className="h-4 w-4" />
              Date Range
            </div>
            {rangeOptions.map(option => (
              <button
                key={option.key}
                onClick={() => setRange(option.key)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  range === option.key
                    ? 'bg-[#F25129] text-white shadow-sm'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white/80 backdrop-blur p-6 text-gray-600 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading analytics data...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white/80 backdrop-blur p-6 text-sm text-gray-600 shadow-sm">
            No analytics events logged in this date range.
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-[#F25129]/15 bg-white/90 backdrop-blur p-4 shadow-sm">
              <div className="text-xs font-semibold text-gray-500">Total Site Visits</div>
              <div className="mt-2 text-2xl font-bold text-gray-900">{totals.totalPageViews}</div>
              <div className="mt-1 text-xs text-gray-500">Page views across the site</div>
            </div>
            <div className="rounded-2xl border border-[#F25129]/15 bg-white/90 backdrop-blur p-4 shadow-sm">
              <div className="text-xs font-semibold text-gray-500">Unique Visitors</div>
              <div className="mt-2 text-2xl font-bold text-gray-900">{totals.uniqueSessions}</div>
              <div className="mt-1 text-xs text-gray-500">Estimated by session ID</div>
            </div>
            <div className="rounded-2xl border border-[#F25129]/15 bg-white/90 backdrop-blur p-4 shadow-sm">
              <div className="text-xs font-semibold text-gray-500">Home Page Visits</div>
              <div className="mt-2 text-2xl font-bold text-gray-900">{totals.homePageViews}</div>
              <div className="mt-1 text-xs text-gray-500">`/` and `/home`</div>
            </div>
            <div className="rounded-2xl border border-[#F25129]/15 bg-white/90 backdrop-blur p-4 shadow-sm">
              <div className="text-xs font-semibold text-gray-500">Top Source</div>
              <div className="mt-2 text-2xl font-bold text-gray-900">
                {trafficSources[0]?.source || 'direct'}
              </div>
              <div className="mt-1 text-xs text-gray-500">Based on page views</div>
            </div>
            <div className="rounded-2xl border border-[#F25129]/15 bg-white/90 backdrop-blur p-4 shadow-sm">
              <div className="text-xs font-semibold text-gray-500">Total Event Views</div>
              <div className="mt-2 text-2xl font-bold text-gray-900">{totals.totalEventViews}</div>
            </div>
            <div className="rounded-2xl border border-[#F25129]/15 bg-white/90 backdrop-blur p-4 shadow-sm">
              <div className="text-xs font-semibold text-gray-500">Total Event Clicks</div>
              <div className="mt-2 text-2xl font-bold text-gray-900">{totals.totalEventClicks}</div>
            </div>
            <div className="rounded-2xl border border-[#F25129]/15 bg-white/90 backdrop-blur p-4 shadow-sm">
              <div className="text-xs font-semibold text-gray-500">Total Media Opens</div>
              <div className="mt-2 text-2xl font-bold text-gray-900">{totals.totalMediaOpens}</div>
            </div>
            <div className="rounded-2xl border border-[#F25129]/15 bg-white/90 backdrop-blur p-4 shadow-sm">
              <div className="text-xs font-semibold text-gray-500">Payments Completed</div>
              <div className="mt-2 text-2xl font-bold text-gray-900">{totals.totalPaymentSuccess}</div>
            </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white/95 backdrop-blur p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <BarChart3 className="h-4 w-4 text-[#F25129]" />
                Traffic Sources
              </div>
              <div className="mt-4 space-y-3">
                {trafficSources.slice(0, 8).map((item) => {
                  const max = trafficSources[0]?.count || 1;
                  return (
                    <div key={item.source} className="flex items-center gap-3">
                      <div className="w-28 text-xs text-gray-600">{formatLabel(item.source)}</div>
                      <div className="flex-1 h-2 rounded-full bg-gray-100">
                        <div
                          className="h-2 rounded-full bg-emerald-500"
                          style={{ width: `${(item.count / max) * 100}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-600 w-10 text-right">{item.count}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                      <th className="py-2 pr-2">Source</th>
                      <th className="py-2">Visits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trafficSources.slice(0, 10).map((item) => (
                      <tr key={`source-${item.source}`} className="border-b border-gray-100">
                        <td className="py-2 pr-2 text-gray-700">{formatLabel(item.source)}</td>
                        <td className="py-2 font-semibold text-gray-900">{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

              <div className="rounded-2xl border border-gray-200 bg-white/95 backdrop-blur p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <BarChart3 className="h-4 w-4 text-[#F25129]" />
                Event Popularity
              </div>
              <div className="mt-4 space-y-3">
                {eventPopularity.slice(0, 6).map((item) => {
                  const maxViews = eventPopularity[0]?.views || 1;
                  return (
                    <div key={item.id} className="flex items-center gap-3">
                      <div className="w-28 text-xs text-gray-600">{formatLabel(item.title)}</div>
                      <div className="flex-1 h-2 rounded-full bg-gray-100">
                        <div
                          className="h-2 rounded-full bg-[#F25129]"
                          style={{ width: `${(item.views / maxViews) * 100}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-600 w-10 text-right">{item.views}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                      <th className="py-2 pr-2">Event</th>
                      <th className="py-2 pr-2">Views</th>
                      <th className="py-2">Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventPopularity.slice(0, 8).map((item) => (
                      <tr key={`table-${item.id}`} className="border-b border-gray-100">
                        <td className="py-2 pr-2 text-gray-700">{formatLabel(item.title)}</td>
                        <td className="py-2 pr-2 font-semibold text-gray-900">{item.views}</td>
                        <td className="py-2 text-gray-700">{item.clicks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

              <div className="rounded-2xl border border-gray-200 bg-white/95 backdrop-blur p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <CalendarDays className="h-4 w-4 text-[#F25129]" />
                Media Engagement
              </div>
              <div className="mt-4 space-y-3">
                {mediaEngagement.slice(0, 6).map((item) => {
                  const maxOpens = mediaEngagement[0]?.opens || 1;
                  return (
                    <div key={item.id} className="flex items-center gap-3">
                      <div className="w-28 text-xs text-gray-600">{formatLabel(item.title)}</div>
                      <div className="flex-1 h-2 rounded-full bg-gray-100">
                        <div
                          className="h-2 rounded-full bg-blue-500"
                          style={{ width: `${(item.opens / maxOpens) * 100}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-600 w-10 text-right">{item.opens}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                      <th className="py-2 pr-2">Media</th>
                      <th className="py-2">Opens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mediaEngagement.slice(0, 8).map((item) => (
                      <tr key={`media-${item.id}`} className="border-b border-gray-100">
                        <td className="py-2 pr-2 text-gray-700">{formatLabel(item.title)}</td>
                        <td className="py-2 font-semibold text-gray-900">{item.opens}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

            {socialSources.length > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-white/95 backdrop-blur p-6 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-gray-700">Social Traffic</div>
                <div className="text-xs text-gray-500">
                  Visits from Facebook, Instagram, and other social platforms
                </div>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {socialSources.slice(0, 8).map((item) => (
                  <div key={`social-${item.source}`} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <div className="text-xs font-semibold text-gray-500">{formatLabel(item.source)}</div>
                    <div className="mt-2 text-xl font-bold text-gray-900">{item.count}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white/95 backdrop-blur p-6 shadow-sm">
              <div className="text-sm font-semibold text-gray-700">Event Conversion Rate</div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                      <th className="py-2 pr-2">Event</th>
                      <th className="py-2 pr-2">Views</th>
                      <th className="py-2 pr-2">Payments</th>
                      <th className="py-2">Conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventConversion.slice(0, 8).map((item) => (
                      <tr key={`conv-${item.id}`} className="border-b border-gray-100">
                        <td className="py-2 pr-2 text-gray-700">{formatLabel(item.title)}</td>
                        <td className="py-2 pr-2 font-semibold text-gray-900">{item.views}</td>
                        <td className="py-2 pr-2 text-gray-700">{item.success}</td>
                        <td className="py-2 font-semibold text-gray-900">{item.conversion}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

              <div className="rounded-2xl border border-gray-200 bg-white/95 backdrop-blur p-6 shadow-sm">
              <div className="text-sm font-semibold text-gray-700">Traffic Source Quality</div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                      <th className="py-2 pr-2">Source</th>
                      <th className="py-2 pr-2">Clicks</th>
                      <th className="py-2 pr-2">Success</th>
                      <th className="py-2">Conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trafficQuality.slice(0, 8).map((item) => (
                      <tr key={`quality-${item.source}`} className="border-b border-gray-100">
                        <td className="py-2 pr-2 text-gray-700">{formatLabel(item.source)}</td>
                        <td className="py-2 pr-2 text-gray-700">{item.clicks}</td>
                        <td className="py-2 pr-2 text-gray-700">{item.success}</td>
                        <td className="py-2 font-semibold text-gray-900">{item.conversion}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white/95 backdrop-blur p-6 shadow-sm">
              <div className="text-sm font-semibold text-gray-700">Device Split</div>
              <div className="mt-4 space-y-3">
                {deviceSplit.map((item) => (
                  <div key={`device-${item.label}`} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{formatLabel(item.label)}</span>
                    <span className="font-semibold text-gray-900">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
              <div className="rounded-2xl border border-gray-200 bg-white/95 backdrop-blur p-6 shadow-sm">
              <div className="text-sm font-semibold text-gray-700">Browser Split</div>
              <div className="mt-4 space-y-3">
                {browserSplit.map((item) => (
                  <div key={`browser-${item.label}`} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{formatLabel(item.label)}</span>
                    <span className="font-semibold text-gray-900">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
              <div className="rounded-2xl border border-gray-200 bg-white/95 backdrop-blur p-6 shadow-sm">
              <div className="text-sm font-semibold text-gray-700">New vs Returning</div>
              <div className="mt-4 space-y-3">
                {visitorSplit.map((item) => (
                  <div key={`visitor-${item.label}`} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{formatLabel(item.label)}</span>
                    <span className="font-semibold text-gray-900">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white/95 backdrop-blur p-6 shadow-sm">
              <div className="text-sm font-semibold text-gray-700">Peak Hours</div>
              <div className="mt-4 space-y-2">
                {timeOfDay.map((item) => (
                  <div key={`hour-${item.hour}`} className="flex items-center gap-3">
                    <div className="w-10 text-xs text-gray-600">{item.hour}:00</div>
                    <div className="flex-1 h-2 rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full bg-purple-500"
                        style={{ width: `${(item.count / (timeOfDay.reduce((m, v) => Math.max(m, v.count), 1))) * 100}%` }}
                      />
                    </div>
                    <div className="w-10 text-xs text-gray-600 text-right">{item.count}</div>
                  </div>
                ))}
              </div>
            </div>
              <div className="rounded-2xl border border-gray-200 bg-white/95 backdrop-blur p-6 shadow-sm">
              <div className="text-sm font-semibold text-gray-700">Peak Days</div>
              <div className="mt-4 space-y-2">
                {dayOfWeek.map((item) => (
                  <div key={`day-${item.label}`} className="flex items-center gap-3">
                    <div className="w-10 text-xs text-gray-600">{item.label}</div>
                    <div className="flex-1 h-2 rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full bg-indigo-500"
                        style={{ width: `${(item.count / (dayOfWeek.reduce((m, v) => Math.max(m, v.count), 1))) * 100}%` }}
                      />
                    </div>
                    <div className="w-10 text-xs text-gray-600 text-right">{item.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

            <div className="rounded-2xl border border-gray-200 bg-white/95 backdrop-blur p-6 shadow-sm">
            <div className="text-sm font-semibold text-gray-700">Event Interest Heatmap</div>
            <div className="mt-4 space-y-3">
              {eventInterest.slice(0, 10).map((item) => {
                const max = eventInterest[0]?.count || 1;
                return (
                  <div key={`interest-${item.category}`} className="flex items-center gap-3">
                    <div className="w-28 text-xs text-gray-600">{formatLabel(item.category)}</div>
                    <div className="flex-1 h-2 rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full bg-amber-500"
                        style={{ width: `${(item.count / max) * 100}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-600 w-10 text-right">{item.count}</div>
                  </div>
                );
              })}
            </div>
          </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white/95 backdrop-blur p-6 shadow-sm">
              <div className="text-sm font-semibold text-gray-700">Landing Section Performance</div>
              <div className="mt-4 space-y-3">
                {landingSectionPerformance.length === 0 && (
                  <div className="text-xs text-gray-500">No landing section data yet.</div>
                )}
                {landingSectionPerformance.slice(0, 8).map((item) => (
                  <div key={`landing-${item.section}`} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{formatLabel(item.section)}</span>
                    <span className="font-semibold text-gray-900">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>

              <div className="rounded-2xl border border-gray-200 bg-white/95 backdrop-blur p-6 shadow-sm">
              <div className="text-sm font-semibold text-gray-700">CTA Effectiveness</div>
              <div className="mt-4 space-y-3">
                {ctaStats.length === 0 && (
                  <div className="text-xs text-gray-500">No CTA clicks yet.</div>
                )}
                {ctaStats.slice(0, 8).map((item) => (
                  <div key={`cta-${item.label}`} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{formatLabel(item.label)}</span>
                    <span className="font-semibold text-gray-900">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

            <div className="rounded-2xl border border-gray-200 bg-white/95 backdrop-blur p-6 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-700">Abandoned Payments</div>
              <div className="text-xs text-gray-500">Payment clicks without success</div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="text-xs text-gray-500">Total Abandoned</div>
                <div className="text-xl font-bold text-gray-900">{abandonedPayments.totalAbandoned}</div>
              </div>
              {abandonedPayments.byEvent.slice(0, 4).map((item) => (
                <div key={`abandon-${item.eventId}`} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="text-xs text-gray-500">{formatLabel(item.eventId)}</div>
                  <div className="text-lg font-semibold text-gray-900">{item.count}</div>
                </div>
              ))}
            </div>
          </div>

            <div className="rounded-2xl border border-gray-200 bg-white/95 backdrop-blur p-6 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-700">Payment Funnel</div>
              <div className="text-xs text-gray-500">
                Conversion snapshot for {rangeOptions.find(r => r.key === range)?.label.toLowerCase()}
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {funnel.map((step) => (
                <div key={step.label} className="flex items-center gap-3">
                  <div className="w-28 text-xs text-gray-600">{step.label}</div>
                  <div className="flex-1 h-3 rounded-full bg-gray-100">
                    <div
                      className="h-3 rounded-full bg-emerald-500"
                      style={{ width: `${step.width}%` }}
                    />
                  </div>
                  <div className="text-xs font-semibold text-gray-900 w-12 text-right">{step.count}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                    <th className="py-2 pr-2">Step</th>
                    <th className="py-2">Users</th>
                  </tr>
                </thead>
                <tbody>
                  {funnel.map((step) => (
                    <tr key={`funnel-${step.label}`} className="border-b border-gray-100">
                      <td className="py-2 pr-2 text-gray-700">{step.label}</td>
                      <td className="py-2 font-semibold text-gray-900">{step.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
