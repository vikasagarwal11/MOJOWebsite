import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { Download, Filter, Loader2, RefreshCw } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../config/firebase';
import { calculateNetAmount } from '../../utils/stripePricing';

type MethodFilter = 'all' | 'stripe' | 'zelle' | 'other';
type StatusFilter = 'all' | 'collected' | 'pending' | 'failed' | 'refunded' | 'other';
type DateFilter = 'all' | '7d' | '30d' | '90d';

type FinanceRow = {
  id: string;
  eventId: string;
  eventTitle: string;
  eventCreatedAt: Date | null;
  eventPaymentMethod: string | null;
  transactionId: string;
  amountCents: number;
  netCents: number;
  stripeFeeCents: number;
  method: 'stripe' | 'zelle' | 'other';
  status: 'collected' | 'pending' | 'failed' | 'refunded' | 'other';
  createdAt: Date | null;
  customerName: string;
  customerEmail: string;
};

type EventSummaryRow = {
  eventId: string;
  eventTitle: string;
  eventCreatedAt: Date | null;
  txCount: number;
  collectedGrossCents: number;
  collectedNetCents: number;
  stripeFeeCents: number;
  stripeCollectedCents: number;
  zelleCollectedCents: number;
  pendingCents: number;
  lastPaymentAt: Date | null;
};

const fmtMoney = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);

const fmtDate = (d: Date | null) =>
  d
    ? d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
};

const looksLikeEventId = (value: string) => /^[A-Za-z0-9_-]{16,}$/.test(value);

const normalizeTitle = (value: string): string => value.trim();

const isMeaningfulTitle = (value: string): boolean => {
  const cleaned = normalizeTitle(value);
  if (!cleaned) return false;
  const lower = cleaned.toLowerCase();
  if (lower === 'event' || lower === 'untitled' || lower === 'untitled event') return false;
  return !looksLikeEventId(cleaned);
};

const getDisplayEventTitle = (eventTitle: string, eventId: string): string => {
  if (isMeaningfulTitle(eventTitle)) return eventTitle;
  return `Unknown Event (ID: ${eventId})`;
};

const getMethod = (docData: any, fallbackEventMethod?: string | null): 'stripe' | 'zelle' | 'other' => {
  const paymentMethod = String(docData?.paymentMethod || '').toLowerCase();
  const method = String(docData?.method || '').toLowerCase();
  const metadataMethod = String(docData?.metadata?.paymentMethod || '').toLowerCase();
  const eventMethod = String(fallbackEventMethod || '').toLowerCase();
  const candidates = [paymentMethod, method, metadataMethod, eventMethod];

  if (candidates.some((m) => m === 'stripe' || m === 'card')) return 'stripe';
  if (candidates.some((m) => m === 'zelle')) return 'zelle';
  return 'other';
};

const getStatus = (docData: any): 'collected' | 'pending' | 'failed' | 'refunded' | 'other' => {
  const raw = String(docData?.status || '').toLowerCase();
  if (raw === 'paid' || raw === 'completed' || raw === 'succeeded' || raw === 'success') return 'collected';
  if (raw === 'pending' || raw === 'unpaid' || raw === 'waiting_for_approval' || raw === 'processing') return 'pending';
  if (raw === 'failed' || raw === 'rejected') return 'failed';
  if (raw === 'refunded') return 'refunded';
  return 'other';
};

export const EventFinanceConsole: React.FC = () => {
  const [rows, setRows] = useState<FinanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('30d');
  const [eventCreatedFrom, setEventCreatedFrom] = useState('');
  const [eventCreatedTo, setEventCreatedTo] = useState('');

  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [eventsSnap, txSnap] = await Promise.all([
        getDocs(collection(db, 'events')),
        getDocs(query(collection(db, 'payment_transactions'), orderBy('createdAt', 'desc'))),
      ]);

      const eventMetaMap = new Map<string, { title: string; createdAt: Date | null; paymentMethod: string | null }>();
      eventsSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        eventMetaMap.set(docSnap.id, {
          title: String(data?.title || 'Untitled Event'),
          createdAt: toDate(data?.createdAt),
          paymentMethod: String(data?.pricing?.paymentMethod || '').toLowerCase() || null,
        });
      });

      const nextRows: FinanceRow[] = txSnap.docs.map((docSnap) => {
        const data = docSnap.data();
        const eventId = String(data?.eventId || 'unknown_event');
        const metadataTitle = String(data?.metadata?.eventTitle || '').trim();
        const eventMeta = eventMetaMap.get(eventId);
        const method = getMethod(data, eventMeta?.paymentMethod || null);
        const status = getStatus(data);
        const amountCents = Number(data?.amount || 0);
        const netCents = method === 'stripe' ? calculateNetAmount(amountCents) : amountCents;
        const stripeFeeCents = method === 'stripe' ? Math.max(0, amountCents - netCents) : 0;
        const eventTitle = isMeaningfulTitle(metadataTitle)
          ? metadataTitle
          : isMeaningfulTitle(eventMeta?.title || '')
            ? String(eventMeta?.title || '')
            : eventId;

        const firstName = String(data?.guestContactInfo?.firstName || '').trim();
        const lastName = String(data?.guestContactInfo?.lastName || '').trim();
        const customerName = `${firstName} ${lastName}`.trim() || String(data?.metadata?.attendeeName || 'Unknown');
        const customerEmail = String(data?.guestContactInfo?.email || '').trim();

        return {
          id: docSnap.id,
          eventId,
          eventTitle,
          eventCreatedAt: eventMeta?.createdAt || null,
          eventPaymentMethod: eventMeta?.paymentMethod || null,
          transactionId: String(data?.transactionId || docSnap.id),
          amountCents,
          netCents,
          stripeFeeCents,
          method,
          status,
          createdAt: toDate(data?.createdAt),
          customerName,
          customerEmail,
        };
      });

      setRows(nextRows);
    } catch (err: any) {
      if (import.meta.env.DEV) console.error('[EventFinanceConsole] Failed to load finance data', err);
      setError(err?.message || 'Failed to load finance data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  const filteredRows = useMemo(() => {
    const now = Date.now();
    const minDateMs =
      dateFilter === '7d'
        ? now - 7 * 24 * 60 * 60 * 1000
        : dateFilter === '30d'
          ? now - 30 * 24 * 60 * 60 * 1000
          : dateFilter === '90d'
            ? now - 90 * 24 * 60 * 60 * 1000
            : null;

    const q = searchQuery.trim().toLowerCase();
    const fromMs = eventCreatedFrom ? new Date(`${eventCreatedFrom}T00:00:00`).getTime() : null;
    const toMs = eventCreatedTo ? new Date(`${eventCreatedTo}T23:59:59.999`).getTime() : null;

    return rows.filter((row) => {
      if (eventFilter !== 'all' && row.eventId !== eventFilter) return false;
      if (methodFilter !== 'all' && row.method !== methodFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (minDateMs && row.createdAt && row.createdAt.getTime() < minDateMs) return false;
      if (fromMs || toMs) {
        const eventCreatedMs = row.eventCreatedAt?.getTime();
        if (!eventCreatedMs) return false;
        if (fromMs && eventCreatedMs < fromMs) return false;
        if (toMs && eventCreatedMs > toMs) return false;
      }

      if (!q) return true;
      return (
        row.eventTitle.toLowerCase().includes(q) ||
        row.eventId.toLowerCase().includes(q) ||
        row.transactionId.toLowerCase().includes(q) ||
        row.customerName.toLowerCase().includes(q) ||
        row.customerEmail.toLowerCase().includes(q)
      );
    });
  }, [rows, searchQuery, eventFilter, methodFilter, statusFilter, dateFilter, eventCreatedFrom, eventCreatedTo]);

  const eventOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((row) => {
      if (!map.has(row.eventId)) map.set(row.eventId, getDisplayEventTitle(row.eventTitle, row.eventId));
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const totals = useMemo(() => {
    let collectedGrossCents = 0;
    let collectedNetCents = 0;
    let stripeFeeCents = 0;
    let pendingCents = 0;
    let refundedCents = 0;

    filteredRows.forEach((row) => {
      if (row.status === 'collected') {
        collectedGrossCents += row.amountCents;
        collectedNetCents += row.netCents;
        stripeFeeCents += row.stripeFeeCents;
      } else if (row.status === 'pending') {
        pendingCents += row.amountCents;
      } else if (row.status === 'refunded') {
        refundedCents += row.amountCents;
      }
    });

    return {
      collectedGrossCents,
      collectedNetCents,
      stripeFeeCents,
      pendingCents,
      refundedCents,
    };
  }, [filteredRows]);

  const eventSummary = useMemo<EventSummaryRow[]>(() => {
    const map = new Map<string, EventSummaryRow>();

    filteredRows.forEach((row) => {
      const existing = map.get(row.eventId) || {
        eventId: row.eventId,
        eventTitle: row.eventTitle,
        eventCreatedAt: row.eventCreatedAt,
        txCount: 0,
        collectedGrossCents: 0,
        collectedNetCents: 0,
        stripeFeeCents: 0,
        stripeCollectedCents: 0,
        zelleCollectedCents: 0,
        pendingCents: 0,
        lastPaymentAt: null,
      };

      existing.txCount += 1;
      if (row.createdAt && (!existing.lastPaymentAt || row.createdAt > existing.lastPaymentAt)) {
        existing.lastPaymentAt = row.createdAt;
      }
      if (!existing.eventCreatedAt && row.eventCreatedAt) {
        existing.eventCreatedAt = row.eventCreatedAt;
      }

      if (row.status === 'collected') {
        existing.collectedGrossCents += row.amountCents;
        existing.collectedNetCents += row.netCents;
        existing.stripeFeeCents += row.stripeFeeCents;
        if (row.method === 'stripe') existing.stripeCollectedCents += row.amountCents;
        if (row.method === 'zelle') existing.zelleCollectedCents += row.amountCents;
      }

      if (row.status === 'pending') existing.pendingCents += row.amountCents;
      map.set(row.eventId, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.collectedNetCents - a.collectedNetCents);
  }, [filteredRows]);

  const exportCsv = () => {
    const headers = [
      'Event',
      'Event ID',
      'Transaction ID',
      'Date',
      'Customer',
      'Email',
      'Method',
      'Status',
      'Gross Amount',
      'Net Earnings',
      'Stripe Fee',
    ];

    const rowsCsv = filteredRows.map((row) => [
      getDisplayEventTitle(row.eventTitle, row.eventId),
      row.eventId,
      row.transactionId,
      row.createdAt ? row.createdAt.toISOString() : '',
      row.customerName,
      row.customerEmail,
      row.method,
      row.status,
      (row.amountCents / 100).toFixed(2),
      (row.netCents / 100).toFixed(2),
      (row.stripeFeeCents / 100).toFixed(2),
    ]);

    const content = [headers, ...rowsCsv]
      .map((line) =>
        line
          .map((value) => {
            const safe = String(value ?? '');
            if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
              return `"${safe.replace(/"/g, '""')}"`;
            }
            return safe;
          })
          .join(',')
      )
      .join('\n');

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance_console_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#F25129]/20 bg-gradient-to-r from-[#FFF7F3] to-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Finance Console</h2>
            <p className="text-sm text-gray-600">
              Event earnings, Stripe collections, Zelle collections, and transaction-level tracking with filters.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={filteredRows.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg bg-[#F25129] px-3 py-2 text-sm font-semibold text-white hover:bg-[#E0451F] disabled:opacity-50"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Transactions</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{filteredRows.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Collected Gross</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{fmtMoney(totals.collectedGrossCents)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Net Earnings</p>
          <p className="mt-2 text-2xl font-bold text-emerald-600">{fmtMoney(totals.collectedNetCents)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Stripe Fees</p>
          <p className="mt-2 text-2xl font-bold text-amber-600">{fmtMoney(totals.stripeFeeCents)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pending / Unpaid</p>
          <p className="mt-2 text-2xl font-bold text-blue-600">{fmtMoney(totals.pendingCents)}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Filter className="h-4 w-4 text-[#F25129]" />
          Filter Transactions
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search event, customer, transaction"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
          />
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
          >
            <option value="all">All events</option>
            {eventOptions.map(([eventId, eventTitle]) => (
              <option key={eventId} value={eventId}>
                {eventTitle}
              </option>
            ))}
          </select>
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value as MethodFilter)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
          >
            <option value="all">All methods</option>
            <option value="stripe">Stripe</option>
            <option value="zelle">Zelle</option>
            <option value="other">Other</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
          >
            <option value="all">All statuses</option>
            <option value="collected">Collected</option>
            <option value="pending">Pending / Unpaid</option>
            <option value="failed">Failed / Rejected</option>
            <option value="refunded">Refunded</option>
            <option value="other">Other</option>
          </select>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
          >
            <option value="all">All time</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <input
            type="date"
            value={eventCreatedFrom}
            onChange={(e) => setEventCreatedFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
            aria-label="Event created from date"
          />
          <input
            type="date"
            value={eventCreatedTo}
            onChange={(e) => setEventCreatedTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
            aria-label="Event created to date"
          />
          <button
            type="button"
            onClick={() => {
              setEventCreatedFrom('');
              setEventCreatedTo('');
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Clear Event Date
          </button>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-dashed bg-white p-6 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-[#F25129]" />
            Loading finance data...
          </div>
        </div>
      )}

      {!loading && error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {!loading && !error && (
        <>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Event Earnings Breakdown</h3>
            {eventSummary.length === 0 ? (
              <p className="text-sm text-gray-500">No transactions match your filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="py-2 pr-4">Event</th>
                      <th className="py-2 pr-4">Event Created</th>
                      <th className="py-2 pr-4">Tx</th>
                      <th className="py-2 pr-4">Gross</th>
                      <th className="py-2 pr-4">Net Earnings</th>
                      <th className="py-2 pr-4">Stripe Fees</th>
                      <th className="py-2 pr-4">Stripe Collected</th>
                      <th className="py-2 pr-4">Zelle Collected</th>
                      <th className="py-2 pr-4">Pending</th>
                      <th className="py-2">Last Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventSummary.map((row) => (
                      <tr key={row.eventId} className="border-b border-gray-100">
                        <td className="py-2 pr-4 font-medium text-gray-900">{getDisplayEventTitle(row.eventTitle, row.eventId)}</td>
                        <td className="py-2 pr-4 text-gray-600">{fmtDate(row.eventCreatedAt)}</td>
                        <td className="py-2 pr-4 text-gray-700">{row.txCount}</td>
                        <td className="py-2 pr-4 text-gray-700">{fmtMoney(row.collectedGrossCents)}</td>
                        <td className="py-2 pr-4 font-semibold text-emerald-700">{fmtMoney(row.collectedNetCents)}</td>
                        <td className="py-2 pr-4 text-amber-700">{fmtMoney(row.stripeFeeCents)}</td>
                        <td className="py-2 pr-4 text-gray-700">{fmtMoney(row.stripeCollectedCents)}</td>
                        <td className="py-2 pr-4 text-gray-700">{fmtMoney(row.zelleCollectedCents)}</td>
                        <td className="py-2 pr-4 text-blue-700">{fmtMoney(row.pendingCents)}</td>
                        <td className="py-2 text-gray-600">{fmtDate(row.lastPaymentAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Transaction Details</h3>
            {filteredRows.length === 0 ? (
              <p className="text-sm text-gray-500">No transactions match your filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 pr-4">Event</th>
                      <th className="py-2 pr-4">Customer</th>
                      <th className="py-2 pr-4">Method</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Gross</th>
                      <th className="py-2 pr-4">Net</th>
                      <th className="py-2 pr-4">Stripe Fee</th>
                      <th className="py-2">Transaction ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.id} className="border-b border-gray-100">
                        <td className="py-2 pr-4 text-gray-600">{fmtDate(row.createdAt)}</td>
                        <td className="py-2 pr-4 text-gray-900">{getDisplayEventTitle(row.eventTitle, row.eventId)}</td>
                        <td className="py-2 pr-4">
                          <div className="font-medium text-gray-900">{row.customerName}</div>
                          <div className="text-xs text-gray-500">{row.customerEmail || '-'}</div>
                        </td>
                        <td className="py-2 pr-4 uppercase text-gray-700">{row.method}</td>
                        <td className="py-2 pr-4 capitalize text-gray-700">{row.status}</td>
                        <td className="py-2 pr-4 text-gray-900">{fmtMoney(row.amountCents)}</td>
                        <td className="py-2 pr-4 font-medium text-emerald-700">{fmtMoney(row.netCents)}</td>
                        <td className="py-2 pr-4 text-amber-700">{fmtMoney(row.stripeFeeCents)}</td>
                        <td className="py-2 text-xs text-gray-600">{row.transactionId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="text-xs text-gray-500">
            Refunded total in current filter: <span className="font-semibold text-gray-700">{fmtMoney(totals.refundedCents)}</span>
          </div>
        </>
      )}
    </div>
  );
};

export default EventFinanceConsole;
