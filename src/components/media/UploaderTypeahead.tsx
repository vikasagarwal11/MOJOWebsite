import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, startAfter, startAt, endAt, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Search, X } from 'lucide-react';

type UserLite = { id: string; displayName?: string; email?: string; photoURL?: string };

export default function UploaderTypeahead({
  value, onChange, clearLabel = 'All Uploaders'
}: {
  value: { id: string } | null;
  onChange: (u: { id: string } | null) => void;
  clearLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [qText, setQText] = useState('');
  const [items, setItems] = useState<UserLite[]>([]);
  const [next, setNext] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => { 
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false); 
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

            async function fetchPage(reset = false) {
            setLoading(true);
            try {
              const usersCol = collection(db, 'users');
              // Use case-insensitive search on displayNameLower
              const lower = qText.trim().toLowerCase();
              const base = lower
                ? query(usersCol, orderBy('displayNameLower'), startAt(lower), endAt(lower + '\uf8ff'), limit(25))
                : query(usersCol, orderBy('displayNameLower'), limit(25));
              const qRef = reset || !next ? base : query(base, startAfter(next));

      const snap = await getDocs(qRef);
      const page = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as UserLite[];
      setItems(prev => reset ? page : [...prev, ...page]);
      setNext(snap.docs[snap.docs.length - 1] ?? null);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      // Fallback to empty results
      setItems([]);
      setNext(null);
    } finally { 
      setLoading(false); 
    }
  }

  useEffect(() => {
    const t = setTimeout(() => fetchPage(true), 250);
    return () => clearTimeout(t);
  }, [qText]);

  const selectedLabel = useMemo(() => {
    if (!value) return clearLabel;
    const sel = items.find(i => i.id === value.id);
    return sel?.displayName || sel?.email || value.id;
  }, [value, items, clearLabel]);

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full h-11 px-3 rounded-xl border border-gray-300 bg-white flex items-center justify-between hover:border-purple-400 focus:border-purple-500 transition-colors"
      >
        <span className="truncate text-left">{selectedLabel}</span>
        <Search className="w-4 h-4 text-gray-400 ml-3 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-full rounded-xl border bg-white shadow-lg p-2">
          <div className="flex items-center gap-2 p-2 border rounded-lg">
            <Search className="w-4 h-4 text-gray-400" />
                    <input
          autoFocus
          value={qText}
          onChange={(e) => setQText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder="Search uploader…"
          className="flex-1 outline-none text-sm"
        />
            {qText && (
              <button onClick={() => setQText('')} className="hover:bg-gray-100 rounded p-1">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-auto mt-2">
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className="w-full text-left px-3 py-2 rounded hover:bg-purple-50 text-purple-700 font-medium"
            >
              {clearLabel}
            </button>
            {items.map(u => (
              <button
                key={u.id}
                onClick={() => { onChange({ id: u.id }); setOpen(false); }}
                className="w-full text-left px-3 py-2 rounded hover:bg-gray-50 flex items-center gap-2"
              >
                {u.photoURL && (
                  <img src={u.photoURL} className="w-6 h-6 rounded-full object-cover" alt="" />
                )}
                <div className="truncate min-w-0">
                  <div className="text-sm font-medium truncate">
                    {u.displayName || u.email || u.id}
                  </div>
                  {u.email && u.displayName && (
                    <div className="text-xs text-gray-500 truncate">{u.email}</div>
                  )}
                </div>
              </button>
            ))}
            {loading && (
              <div className="px-3 py-2 text-sm text-gray-500">Loading…</div>
            )}
            {!loading && next && (
              <button 
                onClick={() => fetchPage(false)} 
                className="w-full px-3 py-2 text-sm text-purple-600 hover:bg-purple-50 rounded"
              >
                Load more
              </button>
            )}
            {!loading && items.length === 0 && qText && (
              <div className="px-3 py-2 text-sm text-gray-500">No uploaders found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
