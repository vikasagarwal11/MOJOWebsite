import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, XCircle, Loader2, RefreshCw, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';
import { getKBGaps, updateKBGapStatus, getKBGapStats, KBGap, KBGapStatus } from '../../services/kbGapsService';
import { useAuth } from '../../contexts/AuthContext';

export const KBGapsPanel: React.FC = () => {
  const { currentUser } = useAuth();
  const [gaps, setGaps] = useState<KBGap[]>([]);
  const [filteredGaps, setFilteredGaps] = useState<KBGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | KBGapStatus>('all');
  const [stats, setStats] = useState({ pending: 0, resolved: 0, wont_fix: 0, total: 0 });

  useEffect(() => {
    loadGaps();
    loadStats();
  }, []);

  useEffect(() => {
    if (statusFilter === 'all') {
      setFilteredGaps(gaps);
    } else {
      setFilteredGaps(gaps.filter(g => g.status === statusFilter));
    }
  }, [gaps, statusFilter]);

  const loadGaps = async () => {
    try {
      setLoading(true);
      const data = await getKBGaps();
      setGaps(data);
    } catch (error: any) {
      console.error('[KBGapsPanel] Error loading gaps:', error);
      toast.error('Failed to load KB gaps');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const data = await getKBGapStats();
      setStats(data);
    } catch (error: any) {
      console.error('[KBGapsPanel] Error loading stats:', error);
    }
  };

  const handleStatusUpdate = async (gapId: string, newStatus: KBGapStatus) => {
    if (!currentUser?.id) {
      toast.error('You must be logged in to update gaps');
      return;
    }

    try {
      setUpdating(gapId);
      await updateKBGapStatus(gapId, newStatus, currentUser.id);
      toast.success(`Gap marked as ${newStatus === 'resolved' ? 'resolved' : 'won\'t fix'}`);
      await loadGaps();
      await loadStats();
    } catch (error: any) {
      console.error('[KBGapsPanel] Error updating gap:', error);
      toast.error('Failed to update gap status');
    } finally {
      setUpdating(null);
    }
  };

  const formatDate = (date: Date | Timestamp) => {
    if (!date) return 'N/A';
    const d = date instanceof Date ? date : (date as any).toDate?.() || new Date();
    return d.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-[#F25129]" />
        <span className="ml-2 text-gray-600">Loading KB gaps...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">KB Gaps</h2>
          <p className="text-sm text-gray-600 mt-1">
            Questions that couldn't be answered by the knowledge base
          </p>
        </div>
        <button
          onClick={() => {
            loadGaps();
            loadStats();
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Gaps</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
        </div>
        <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-700">Pending</p>
              <p className="text-2xl font-bold text-yellow-900">{stats.pending}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-yellow-600" />
          </div>
        </div>
        <div className="bg-green-50 rounded-lg border border-green-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-700">Resolved</p>
              <p className="text-2xl font-bold text-green-900">{stats.resolved}</p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-700">Won't Fix</p>
              <p className="text-2xl font-bold text-gray-900">{stats.wont_fix}</p>
            </div>
            <XCircle className="w-8 h-8 text-gray-600" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Filter:</span>
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === 'all'
              ? 'bg-[#F25129] text-white'
              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setStatusFilter('pending')}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === 'pending'
              ? 'bg-yellow-500 text-white'
              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          Pending
        </button>
        <button
          onClick={() => setStatusFilter('resolved')}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === 'resolved'
              ? 'bg-green-500 text-white'
              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          Resolved
        </button>
        <button
          onClick={() => setStatusFilter('wont_fix')}
          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === 'wont_fix'
              ? 'bg-gray-500 text-white'
              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          Won't Fix
        </button>
      </div>

      {/* Gaps List */}
      {filteredGaps.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">
            {statusFilter === 'all' ? 'No KB gaps found yet.' : `No ${statusFilter} gaps found.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGaps.map(gap => (
            <div
              key={gap.id}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    {gap.status === 'pending' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                        <AlertCircle className="w-3 h-3" />
                        Pending
                      </span>
                    )}
                    {gap.status === 'resolved' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                        <CheckCircle2 className="w-3 h-3" />
                        Resolved
                      </span>
                    )}
                    {gap.status === 'wont_fix' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">
                        <XCircle className="w-3 h-3" />
                        Won't Fix
                      </span>
                    )}
                    <span className="text-xs text-gray-500">
                      {formatDate(gap.detectedAt)}
                    </span>
                  </div>
                  <p className="text-gray-900 font-medium mb-2">{gap.question}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    <span>KB Chunks Found: {gap.kbChunksFound}</span>
                    {gap.bestDistance !== null && (
                      <span>Best Distance: {gap.bestDistance.toFixed(3)}</span>
                    )}
                    {gap.userId && <span>User: {gap.userId.substring(0, 8)}...</span>}
                  </div>
                  {gap.notes && (
                    <p className="text-sm text-gray-600 mt-2 italic">Notes: {gap.notes}</p>
                  )}
                </div>
                {gap.status === 'pending' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStatusUpdate(gap.id, 'resolved')}
                      disabled={updating === gap.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                    >
                      {updating === gap.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      Resolve
                    </button>
                    <button
                      onClick={() => handleStatusUpdate(gap.id, 'wont_fix')}
                      disabled={updating === gap.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                    >
                      {updating === gap.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <XCircle className="w-4 h-4" />
                      )}
                      Won't Fix
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

