
import React from 'react';
import { EventDoc, RSVPDoc, RSVPStatus } from '../hooks/useEvents';

type Props = {
  open: boolean;
  event: EventDoc | null;
  currentUser?: { uid: string; displayName?: string; email?: string };
  onClose: () => void;
  onSubmit: (rsvp: Omit<RSVPDoc, 'createdAt'|'updatedAt'>) => Promise<void>;
};

export const RSVPDrawer: React.FC<Props> = ({ open, event, currentUser, onClose, onSubmit }) => {
  const [status, setStatus] = React.useState<RSVPStatus>('going');
  const [adults, setAdults] = React.useState(1);
  const [kids, setKids] = React.useState(0);
  const [notes, setNotes] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setStatus('going'); setAdults(1); setKids(0); setNotes('');
    }
  }, [open]);

  if (!open || !event) return null;
  const isPaid = !!event.isPaid && status === 'going';

  const submit = async () => {
    if (!currentUser) return;
    await onSubmit({
      userId: currentUser.uid,
      displayName: currentUser.displayName || null,
      email: currentUser.email || null,
      status,
      adults,
      kids,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[998] flex justify-end">
      <div className="w-full max-w-md bg-white h-full shadow-xl p-4 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">RSVP</h3>
          <button className="px-3 py-1 rounded bg-gray-200" onClick={onClose}>Close</button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Status</span>
            <select className="border rounded px-3 py-2" value={status} onChange={e=>setStatus(e.target.value as RSVPStatus)}>
              <option value="going">Going</option>
              <option value="maybe">Maybe</option>
              <option value="not_going">Not going</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Adults</span>
              <input type="number" min={0} className="border rounded px-3 py-2" value={adults} onChange={e=>setAdults(Math.max(0, Number(e.target.value)))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Kids</span>
              <input type="number" min={0} className="border rounded px-3 py-2" value={kids} onChange={e=>setKids(Math.max(0, Number(e.target.value)))} />
            </label>
          </div>

          {isPaid && (
            <div className="rounded-lg border p-3 bg-amber-50">
              This is a paid event. You will be redirected to checkout after submitting.
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Notes (optional)</span>
            <textarea className="border rounded px-3 py-2" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} />
          </label>
        </div>

        <div className="mt-auto flex justify-end gap-2">
          <button className="px-4 py-2 rounded bg-gray-200" onClick={onClose}>Cancel</button>
          <button className="px-4 py-2 rounded bg-indigo-600 text-white" onClick={submit}>
            Submit RSVP
          </button>
        </div>
      </div>
    </div>
  );
};
