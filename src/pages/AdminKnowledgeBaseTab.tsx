import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { collection, onSnapshot, orderBy, query, where, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Plus, FileText, Edit3, Trash2, Loader2, Search, RefreshCw } from 'lucide-react';
import { db } from '../config/firebase';
import {
  deleteKnowledgeEntry,
  KnowledgeEntryPayload,
  KnowledgeVisibility,
  rebuildKnowledgeEmbeddings,
  saveKnowledgeEntry,
  syncSiteCopyToKnowledgeBase,
  getKnowledgeEmbeddingStatus,
  retryFailedKnowledgeEmbeddings,
} from '../services/knowledgeBaseAdminService';

type KnowledgeEntry = {
  id: string;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  visibility: KnowledgeVisibility;
  url?: string | null;
  updatedAt?: Date;
  chunkCount: number;
  sourceKey: string;
  sourceType: 'manual' | 'static' | string;
  metadata?: Record<string, unknown>;
};

type DraftState = {
  title: string;
  summary: string;
  body: string;
  tagsText: string;
  visibility: KnowledgeVisibility;
  url: string;
};

const defaultDraft: DraftState = {
  title: '',
  summary: '',
  body: '',
  tagsText: '',
  visibility: 'members',
  url: '',
};

const visibilityLabels: Record<KnowledgeVisibility, string> = {
  public: 'Public',
  members: 'Members',
  private: 'Private',
};

const sortEntries = (list: KnowledgeEntry[]) =>
  [...list].sort((a, b) => {
    const typeCompare = a.sourceType.localeCompare(b.sourceType);
    if (typeCompare !== 0) return typeCompare;
    const aTime = a.updatedAt?.getTime?.() ?? 0;
    const bTime = b.updatedAt?.getTime?.() ?? 0;
    return bTime - aTime;
  });

export const AdminKnowledgeBaseTab: React.FC = () => {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [manualEntries, setManualEntries] = useState<KnowledgeEntry[]>([]);
  const [staticEntries, setStaticEntries] = useState<KnowledgeEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(defaultDraft);
  const [searchTerm, setSearchTerm] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [embedStatus, setEmbedStatus] = useState<{ ready: number; pending: number; processing: number; error: number; chunks: number; sources: number } | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const collectionListLoadedRef = useRef(false);

  const mergeEntries = useCallback((manualList: KnowledgeEntry[], staticList: KnowledgeEntry[]) => {
    setEntries(sortEntries([...staticList, ...manualList]));
  }, []);

  useEffect(() => {
    mergeEntries(manualEntries, staticEntries);
  }, [manualEntries, staticEntries, mergeEntries]);

  const fetchEmbedStatus = useCallback(async () => {
    try {
      setLoadingStatus(true);
      const s = await getKnowledgeEmbeddingStatus();
      setEmbedStatus(s.counts);
    } catch {
      // non-fatal
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    fetchEmbedStatus();
  }, [fetchEmbedStatus]);

  const fetchStaticEntries = useCallback(async () => {
    try {
      const staticQuery = query(collection(db, 'kb_sources'), where('sourceType', '==', 'static'));
      const snapshot = await getDocs(staticQuery);
      const list = snapshot.docs.map(docSnap => {
        const data = docSnap.data() ?? {};
        return {
          id: (data.sourceId as string) || docSnap.id,
          title: (data.title as string) || 'Untitled Entry',
          summary: (data.summary as string) || '',
          body: (data.body as string) || '',
          tags: Array.isArray(data.tags) ? data.tags.filter(Boolean) : [],
          visibility: (data.visibility as KnowledgeVisibility) || 'members',
          url: data.url ?? null,
          updatedAt: data.updatedAt?.toDate?.() ?? undefined,
          chunkCount: Array.isArray(data.chunkIds) ? data.chunkIds.length : 0,
          sourceKey: docSnap.id,
          sourceType: 'static',
          metadata: data.metadata ?? {},
        } as KnowledgeEntry;
      });
      setStaticEntries(sortEntries(list));
    } catch (error) {
      console.error('Failed to load static knowledge base entries', error);
      toast.error('Static entries are still indexing. Try again in a moment.');
    }
  }, []);

  useEffect(() => {
    const manualQuery = query(collection(db, 'kb_sources'), where('sourceType', '==', 'manual'));

    fetchStaticEntries();

    const unsub = onSnapshot(
      manualQuery,
      snapshot => {
        const manualList: KnowledgeEntry[] = snapshot.docs.map(docSnap => {
          const data = docSnap.data() ?? {};
          return {
            id: (data.sourceId as string) || docSnap.id,
            title: (data.title as string) || 'Untitled Entry',
            summary: (data.summary as string) || '',
            body: (data.body as string) || '',
            tags: Array.isArray(data.tags) ? data.tags.filter(Boolean) : [],
            visibility: (data.visibility as KnowledgeVisibility) || 'members',
            url: data.url ?? null,
            updatedAt: data.updatedAt?.toDate?.() ?? undefined,
            chunkCount: Array.isArray(data.chunkIds) ? data.chunkIds.length : 0,
            sourceKey: docSnap.id,
            sourceType: 'manual',
            metadata: data.metadata ?? {},
          };
        });
        setManualEntries(sortEntries(manualList));
        setLoading(false);
      },
      error => {
        console.error('Failed to load knowledge base entries', error);
        toast.error('Failed to load knowledge base entries. Check Firestore indexes.');
        setLoading(false);
      }
    );

    return () => {
      unsub();
    };
  }, [fetchStaticEntries]);

  useEffect(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      setFilteredEntries(entries);
      return;
    }
    setFilteredEntries(
      entries.filter(entry => {
        const haystack = [
          entry.title,
          entry.summary,
          entry.body,
          entry.tags.join(' '),
          entry.visibility,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(term);
      })
    );
  }, [entries, searchTerm]);

  const openCreate = useCallback(() => {
    setCurrentId(null);
    setDraft(defaultDraft);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((entry: KnowledgeEntry) => {
    setCurrentId(entry.id);
    setDraft({
      title: entry.title,
      summary: entry.summary || '',
      body: entry.body || '',
      tagsText: entry.tags.join(', '),
      visibility: entry.visibility,
      url: entry.url ?? '',
    });
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    if (saving) return;
    setEditorOpen(false);
    setDraft(defaultDraft);
    setCurrentId(null);
  }, [saving]);

  const handleSave = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (saving) return;
      const trimmedTitle = draft.title.trim();
      if (!trimmedTitle) {
        toast.error('Title is required.');
        return;
      }
      const payload: KnowledgeEntryPayload = {
        id: currentId ?? undefined,
        title: trimmedTitle,
        summary: draft.summary.trim(),
        body: draft.body.trim(),
        visibility: draft.visibility,
        tags: draft.tagsText
          .split(',')
          .map(tag => tag.trim())
          .filter(Boolean),
        url: draft.url.trim() || undefined,
      };

      try {
        setSaving(true);
        await saveKnowledgeEntry(payload);
        toast.success(currentId ? 'Knowledge entry updated.' : 'Knowledge entry created.');
        closeEditor();
      } catch (error: any) {
        console.error('Failed to save knowledge entry', error);
        toast.error(error?.message || 'Failed to save entry.');
      } finally {
        setSaving(false);
      }
    },
    [currentId, draft, closeEditor, saving]
  );

  const handleDelete = useCallback(async (entry: KnowledgeEntry) => {
    if (entry.sourceType === 'static') {
      toast('Static site entries are managed via Sync site copy.', { icon: 'ℹ️' });
      return;
    }
    const confirmed = window.confirm(`Delete "${entry.title}" from the knowledge base?`);
    if (!confirmed) return;
    try {
      await deleteKnowledgeEntry(entry.id);
      toast.success('Knowledge entry deleted.');
    } catch (error: any) {
      console.error('Failed to delete knowledge entry', error);
      toast.error(error?.message || 'Failed to delete entry.');
    }
  }, []);

  const summaryCount = useMemo(() => {
    return {
      total: entries.length,
      public: entries.filter(e => e.visibility === 'public').length,
      members: entries.filter(e => e.visibility === 'members').length,
      private: entries.filter(e => e.visibility === 'private').length,
    };
  }, [entries]);

  const handleSyncStaticEntries = useCallback(async () => {
    if (syncing) return;
    try {
      setSyncing(true);
      const result = await syncSiteCopyToKnowledgeBase();
      const removalNote = result.removed ? ` Removed ${result.removed} old entries.` : '';
      toast.success(`Site copy synced (${result.synced} entries).${removalNote}`);
      await fetchStaticEntries();
      await fetchEmbedStatus();
    } catch (error: any) {
      console.error('Failed to sync site copy to knowledge base', error);
      toast.error(error?.message || 'Failed to sync site content.');
    } finally {
      setSyncing(false);
    }
  }, [fetchStaticEntries, syncing]);

  const handleRebuildEmbeddings = useCallback(async () => {
    if (rebuilding) return;
    try {
      setRebuilding(true);
      const result = await rebuildKnowledgeEmbeddings(150);
      const processed = result?.processed ?? 0;
      const total = result?.totalChecked ?? result?.scanned ?? 0;
      if (total === 0) {
        toast.success(result?.message || 'All knowledge chunks already have embeddings.');
      } else {
        const scannedSuffix = typeof result.scanned === 'number' ? ` (scanned ${result.scanned})` : '';
        toast.success(`Embeddings rebuilt for ${processed} of ${total} chunks${scannedSuffix}.`);
      }
      await fetchEmbedStatus();
    } catch (error: any) {
      console.error('Failed to rebuild embeddings', error);
      toast.error(error?.message || 'Failed to rebuild embeddings.');
    } finally {
      setRebuilding(false);
    }
  }, [rebuilding, fetchEmbedStatus]);

  const handleRetryFailed = useCallback(async () => {
    if (rebuilding) return;
    try {
      setRebuilding(true);
      const result = await retryFailedKnowledgeEmbeddings(100, ['error']);
      toast.success(result?.message || 'Retried failed embeddings.');
      await fetchEmbedStatus();
    } catch (error: any) {
      console.error('Failed to retry failed embeddings', error);
      toast.error(error?.message || 'Failed to retry failed embeddings.');
    } finally {
      setRebuilding(false);
    }
  }, [rebuilding, fetchEmbedStatus]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#F25129]" />
            Knowledge Base
          </h2>
          <p className="text-sm text-gray-600">
            Curate official answers, policies, and evergreen content. Entries are chunked and embedded
            automatically for the Mojo assistant.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSyncStaticEntries}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 text-sm font-medium px-4 py-2 text-gray-700 hover:bg-gray-100 transition disabled:opacity-60"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {syncing ? 'Syncing…' : 'Sync site copy'}
          </button>
          <button
            type="button"
            onClick={handleRebuildEmbeddings}
            disabled={rebuilding}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 text-sm font-medium px-4 py-2 text-gray-700 hover:bg-gray-100 transition disabled:opacity-60"
          >
            {rebuilding ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 rotate-180" />}
            {rebuilding ? 'Rebuilding…' : 'Rebuild embeddings'}
          </button>
          <button
            type="button"
            onClick={handleRetryFailed}
            disabled={rebuilding}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 text-sm font-medium px-4 py-2 text-gray-700 hover:bg-gray-100 transition disabled:opacity-60"
          >
            {rebuilding ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {rebuilding ? 'Retrying…' : 'Retry failed'}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-full bg-[#F25129] text-white px-4 py-2 text-sm font-medium shadow hover:bg-[#E0451F] transition"
          >
            <Plus className="w-4 h-4" />
            New entry
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
          <div className="text-xs text-orange-600 uppercase tracking-wide">Total Entries</div>
          <div className="text-2xl font-semibold text-orange-700 mt-1">{summaryCount.total}</div>
        </div>
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="text-xs text-emerald-600 uppercase tracking-wide">Public</div>
          <div className="text-2xl font-semibold text-emerald-700 mt-1">{summaryCount.public}</div>
        </div>
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="text-xs text-blue-600 uppercase tracking-wide">Members</div>
          <div className="text-2xl font-semibold text-blue-700 mt-1">{summaryCount.members}</div>
        </div>
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
          <div className="text-xs text-purple-600 uppercase tracking-wide">Private/Admin</div>
          <div className="text-2xl font-semibold text-purple-700 mt-1">{summaryCount.private}</div>
        </div>
      </div>

      {embedStatus && (
        <div className="grid md:grid-cols-5 gap-4">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="text-xs text-emerald-600 uppercase tracking-wide">Embeddings Ready</div>
            <div className="text-2xl font-semibold text-emerald-700 mt-1">{embedStatus.ready}</div>
          </div>
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
            <div className="text-xs text-yellow-700 uppercase tracking-wide">Pending</div>
            <div className="text-2xl font-semibold text-yellow-800 mt-1">{embedStatus.pending}</div>
          </div>
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="text-xs text-blue-700 uppercase tracking-wide">Processing</div>
            <div className="text-2xl font-semibold text-blue-800 mt-1">{embedStatus.processing}</div>
          </div>
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
            <div className="text-xs text-rose-700 uppercase tracking-wide">Errors</div>
            <div className="text-2xl font-semibold text-rose-800 mt-1">{embedStatus.error}</div>
          </div>
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
            <div className="text-xs text-gray-600 uppercase tracking-wide">Chunks</div>
            <div className="text-2xl font-semibold text-gray-700 mt-1">{embedStatus.chunks}</div>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="search"
          value={searchTerm}
          onChange={event => setSearchTerm(event.target.value)}
          placeholder="Search by title, summary, tags, or visibility…"
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-[#F25129]"
        />
      </div>

      {loading ? (
        <div className="py-16 text-center text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-[#F25129]" />
          Loading knowledge entries…
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-gray-300 rounded-xl bg-gray-50 text-gray-500">
          <p className="font-medium mb-2">No knowledge entries yet.</p>
          <p className="text-sm">Create your first entry to help the assistant answer richer questions.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredEntries.map(entry => (
            <div
              key={entry.id}
              className="border border-gray-200 rounded-xl bg-white shadow-sm p-5 transition hover:border-[#F25129]/40 hover:shadow-lg"
            >
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900">{entry.title}</h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        entry.visibility === 'public'
                          ? 'bg-emerald-100 text-emerald-700'
                          : entry.visibility === 'members'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}
                    >
                      {visibilityLabels[entry.visibility]}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      {entry.sourceType === 'static' ? 'Site copy' : 'Manual'}
                    </span>
                  </div>
                  {entry.summary ? <p className="text-sm text-gray-600 mt-1">{entry.summary}</p> : null}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-3">
                    <span>Chunks: {entry.chunkCount}</span>
                    {entry.tags.length > 0 && (
                      <span className="flex items-center gap-1">
                        Tags:
                        {entry.tags.map(tag => (
                          <span key={tag} className="inline-flex px-2 py-0.5 bg-gray-100 rounded-full text-gray-700">
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                    {entry.updatedAt && (
                      <span>
                        Updated {entry.updatedAt.toLocaleDateString()} {entry.updatedAt.toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  {entry.url && (
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#F25129] mt-2 hover:underline"
                    >
                      View source
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(entry)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-gray-200 text-sm text-gray-700 hover:bg-gray-100 transition"
                  >
                    <Edit3 className="w-4 h-4" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(entry)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-sm transition ${
                      entry.sourceType === 'static'
                        ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                        : 'border-red-200 text-red-600 hover:bg-red-50'
                    }`}
                    disabled={entry.sourceType === 'static'}
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <form onSubmit={handleSave}>
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {currentId ? 'Edit knowledge entry' : 'Create knowledge entry'}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Compose the authoritative answer you want Mojo to cite.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeEditor}
                  className="text-sm text-gray-500 hover:text-gray-700"
                  disabled={saving}
                >
                  Close
                </button>
              </div>

              <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={event => setDraft(prev => ({ ...prev, title: event.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F25129] focus:border-[#F25129]"
                    placeholder="Example: Mojo Kids Policy"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Visibility</label>
                  <select
                    value={draft.visibility}
                    onChange={event =>
                      setDraft(prev => ({ ...prev, visibility: event.target.value as KnowledgeVisibility }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F25129] focus:border-[#F25129]"
                  >
                    <option value="public">Public (everyone)</option>
                    <option value="members">Members (signed-in)</option>
                    <option value="private">Admin only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Summary (optional)</label>
                  <textarea
                    value={draft.summary}
                    onChange={event => setDraft(prev => ({ ...prev, summary: event.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F25129] focus:border-[#F25129]"
                    rows={2}
                    placeholder="One-liner that helps with citations."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                  <textarea
                    value={draft.body}
                    onChange={event => setDraft(prev => ({ ...prev, body: event.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F25129] focus:border-[#F25129]"
                    rows={8}
                    placeholder="Write the full answer here. Use short paragraphs and include clear instructions or policies."
                    required
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                    <input
                      type="text"
                      value={draft.tagsText}
                      onChange={event => setDraft(prev => ({ ...prev, tagsText: event.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F25129] focus:border-[#F25129]"
                      placeholder="Example: policy, kids, membership"
                    />
                    <p className="text-xs text-gray-500 mt-1">Comma separated keywords.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reference URL</label>
                    <input
                      type="url"
                      value={draft.url}
                      onChange={event => setDraft(prev => ({ ...prev, url: event.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F25129] focus:border-[#F25129]"
                      placeholder="Optional link for original resource"
                    />
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full bg-[#F25129] text-white hover:bg-[#E0451F] transition disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {saving ? 'Saving…' : currentId ? 'Save changes' : 'Create entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

