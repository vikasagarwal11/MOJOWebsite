// src/components/events/EventTypeahead.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Tag, Search, X } from 'lucide-react';
import { collection, getDocs, limit, orderBy, query, startAt, endAt } from 'firebase/firestore';
import { db } from '../../config/firebase';

type EventLite = {
  id: string;
  title?: string;
  titleLower?: string;
  startAt?: any;
};

type Props = {
  value: { id: string | null; title: string | null };
  onChange: (next: { id: string | null; title: string | null }) => void;
  seedEvents?: EventLite[];  // optional list from parent for local fallback
  placeholder?: string;
  disabled?: boolean;
};

const EventTypeahead: React.FC<Props> = ({
  value,
  onChange,
  seedEvents = [],
  placeholder = 'Search events…',
  disabled,
}) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [remote, setRemote] = useState<EventLite[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
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

  // Remote prefix search on titleLower (optional; falls back to local)
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
        // if index/field missing we just fall back to local
        setRemote([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(doFetch, 250); // debounce
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  // Local fallback over the seed list
  const localMatches = useMemo(() => {
    const txt = q.trim().toLowerCase();
    const base = seedEvents || [];
    if (!txt) return base.slice(0, 12);
    return base.filter(e => (e.title || '').toLowerCase().includes(txt)).slice(0, 12);
  }, [q, seedEvents]);

  const suggestions = (q.trim().length >= 2 && remote.length > 0) ? remote : localMatches;

  useEffect(() => {
    // reset highlight when opening or list changes
    setActiveIndex(suggestions.length ? 0 : -1);
  }, [open, q, loading, suggestions.length]);

  const pick = (ev: EventLite | null) => {
    onChange(ev ? { id: ev.id, title: ev.title || 'Event' } : { id: null, title: null });
    setOpen(false);
    setQ('');
  };

  return (
    <div
      ref={boxRef}
      role="combobox"
      aria-expanded={open}
      aria-owns="ev-suggest"
      aria-haspopup="listbox"
      className="relative"
    >
      <div
        className={`flex items-center gap-2 w-full h-11 px-3 rounded-xl border ${
          open ? 'border-purple-400 ring-2 ring-purple-200' : 'border-gray-300'
        } bg-white cursor-text hover:border-purple-400 transition-colors`}
        onClick={() => setOpen(true)}
      >
        <Tag className="w-4 h-4 text-gray-400" />
        <input
          aria-autocomplete="list"
          aria-controls="ev-suggest"
          aria-activedescendant={
            activeIndex >= 0 ? `ev-opt-${activeIndex}` : undefined
          }
          value={q || (value?.title || '')}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) setOpen(true);
            if (!suggestions.length) return;

            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex(i => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              pick(suggestions[activeIndex] || suggestions[0]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 outline-none bg-transparent text-gray-800 placeholder:text-gray-400"
        />
        {value?.id && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); pick(null); }}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        )}
        <Search className="w-4 h-4 text-gray-400" />
      </div>



      {open && (
        <div
          id="ev-suggest"
          role="listbox"
          className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-auto"
        >
          <button
            type="button"
            role="option"
            aria-selected={false}
            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700"
            onClick={() => pick(null)}
          >
            No event tag
          </button>

          {loading && <div className="px-3 py-2 text-sm text-gray-400">Searching…</div>}
          {!loading && suggestions.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-400">No matches</div>
          )}

          {!loading &&
            suggestions.map((ev, idx) => (
              <button
                key={ev.id}
                id={`ev-opt-${idx}`}
                type="button"
                role="option"
                aria-selected={idx === activeIndex}
                className={`w-full text-left px-3 py-2 hover:bg-purple-50 ${
                  idx === activeIndex ? 'bg-purple-50' : ''
                }`}
                onMouseEnter={() => setActiveIndex(idx)}
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
