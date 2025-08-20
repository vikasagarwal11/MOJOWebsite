import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Tag, Search } from 'lucide-react';
import { collection, getDocs, limit, orderBy, query, startAt, endAt } from 'firebase/firestore';
import { db } from '../../config/firebase';

type EventLite = { id: string; title?: string; titleLower?: string; startAt?: any };
type Props = {
  value: { id: string | null; title: string | null };
  onChange: (next: { id: string | null; title: string | null }) => void;
  seedEvents?: EventLite[];
  placeholder?: string;
  disabled?: boolean;
};

const EventTypeahead: React.FC<Props> = ({ value, onChange, seedEvents = [], placeholder = 'Search events…', disabled }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [remote, setRemote] = useState<EventLite[]>([]);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, []);

  // Remote prefix search on titleLower
  useEffect(() => {
    let cancelled = false;
    const doFetch = async () => {
      if (q.trim().length < 2) { setRemote([]); return; }
      setLoading(true);
      try {
        const lower = q.trim().toLowerCase();
        const col = collection(db, 'events');
        const qry = query(col, orderBy('titleLower'), startAt(lower), endAt(lower + '\uf8ff'), limit(10));
        const snap = await getDocs(qry);
        if (cancelled) return;
        setRemote(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      } catch {
        setRemote([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(doFetch, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  // Local fallback
  const localMatches = useMemo(() => {
    const txt = q.trim().toLowerCase();
    const base = seedEvents || [];
    if (!txt) return base.slice(0, 12);
    return base.filter(e => (e.title || '').toLowerCase().includes(txt)).slice(0, 12);
  }, [q, seedEvents]);

  const suggestions = (q.trim().length >= 2 && remote.length > 0) ? remote : localMatches;

  const pick = (ev: EventLite | null) => {
    onChange(ev ? { id: ev.id, title: ev.title || 'Event' } : { id: null, title: null });
    setOpen(false);
    setQ('');
  };

  return (
    <div ref={boxRef} role="combobox" aria-expanded={open} aria-owns="ev-suggest" className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">Tag with Event (Optional)</label>

      <div
        className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg border ${open ? 'border-purple-400 ring-2 ring-purple-200' : 'border-gray-300'} bg-white cursor-text`}
        onClick={() => setOpen(true)}
      >
        <Tag className="w-4 h-4 text-gray-400" />
        <input
          aria-autocomplete="list"
          aria-controls="ev-suggest"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (suggestions[0]) pick(suggestions[0]);
              else pick(null);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 outline-none bg-transparent text-gray-800 placeholder:text-gray-400"
        />
        <Search className="w-4 h-4 text-gray-400" />
      </div>

      {(value?.id || value?.title) && (
        <div className="mt-2 text-sm text-gray-700">
          Selected: <span className="font-medium">{value.title || 'No event tag'}</span>
          <button type="button" onClick={() => pick(null)} className="ml-2 text-purple-600 hover:underline">Clear</button>
        </div>
      )}

      {open && (
        <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-auto">
          <button type="button" className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700" onClick={() => pick(null)}>
            No event tag
          </button>

          {loading && <div className="px-3 py-2 text-sm text-gray-400">Searching…</div>}
          {!loading && suggestions.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">No matches</div>}

          {!loading && suggestions.map(ev => (
            <button
              key={ev.id}
              type="button"
              role="option"
              className="w-full text-left px-3 py-2 hover:bg-purple-50"
              onClick={() => pick(ev)}
            >
              <div className="text-sm text-gray-900">{ev.title || 'Untitled Event'}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default EventTypeahead;
