import React, { useEffect, useState } from 'react';

type HistoryItem = {
  id: string;
  title?: string;
  type?: string;
  minutes?: number;
  rounds?: number;
  rpe?: number | null;
  notes?: string | null;
  completedAt?: any;
  swaps?: Array<{ blockIndex: number; itemIndex: number; from: string; to: string }> | null;
  blocks?: Array<{ name: string; items?: string[] }> | null;
};

type Props = {
  open: boolean;
  item: HistoryItem | null;
  onClose: () => void;
  onSave: (updates: { rpe?: number | null; notes?: string | null; title?: string; minutes?: number; rounds?: number | null }) => Promise<void>;
  onDelete: () => Promise<void>;
};

export default function SessionHistoryModal({ open, item, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState<number>(0);
  const [rounds, setRounds] = useState<number | null>(null);
  const [rpe, setRpe] = useState<number | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    setTitle(item.title || 'Session');
    setMinutes(item.minutes || 0);
    setRounds(typeof item.rounds === 'number' ? item.rounds : null);
    setRpe(typeof item.rpe === 'number' ? item.rpe : undefined);
    setNotes(item.notes || '');
  }, [open, item?.id]);

  if (!open || !item) return null;

  const dateStr = item.completedAt?.toDate?.() ? new Date(item.completedAt.toDate()).toLocaleString() : '';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b">
          <div className="text-sm text-gray-500">Completed {dateStr}</div>
          <div className="text-xl font-semibold text-gray-900">{item.type?.toUpperCase()} • {item.minutes} min</div>
        </div>

        <div className="p-5 space-y-4">
          {Array.isArray(item.swaps) && item.swaps.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-gray-800">Swaps</div>
              <ul className="mt-1 text-xs text-gray-600 list-disc list-inside max-h-24 overflow-auto">
                {item.swaps.slice(0, 8).map((s, idx) => (
                  <li key={idx}>{s.from} → {s.to}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-600 mb-1">Title</label>
            <input value={title} onChange={e=> setTitle(e.target.value)} className="w-full border rounded px-3 py-2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Minutes</label>
              <input type="number" value={minutes} onChange={e=> setMinutes(Math.max(1, Number(e.target.value)||0))} className="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Rounds (optional)</label>
              <input type="number" value={rounds ?? ''} onChange={e=> setRounds(e.target.value === '' ? null : Math.max(0, Number(e.target.value)||0))} className="w-full border rounded px-3 py-2" />
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">RPE</div>
            <div className="flex items-center gap-2 flex-wrap">
              {Array.from({ length: 10 }).map((_, i) => (
                <button key={i} onClick={()=> setRpe(i+1)} className={`px-2 py-1 rounded border text-xs ${rpe===i+1 ? 'bg-black text-white' : ''}`}>{i+1}</button>
              ))}
              <button onClick={()=> setRpe(undefined)} className="px-2 py-1 rounded border text-xs">Clear</button>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Notes</label>
            <textarea value={notes} onChange={e=> setNotes(e.target.value)} rows={4} className="w-full border rounded px-3 py-2" />
          </div>
        </div>

        <div className="px-5 py-4 border-t flex items-center gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded border">Close</button>
          <div className="ml-auto" />
          <button disabled={deleting} onClick={async ()=> { setDeleting(true); try { await onDelete(); onClose(); } finally { setDeleting(false); } }} className="px-4 py-2 rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-60">{deleting ? 'Deleting…' : 'Delete'}</button>
          <button disabled={saving} onClick={async ()=> { setSaving(true); try { await onSave({ rpe: rpe ?? null, notes: notes.trim() || null, title, minutes, rounds }); onClose(); } finally { setSaving(false); } }} className="px-4 py-2 rounded bg-black text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
