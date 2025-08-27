
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';
import { EventDoc } from '../hooks/useEvents';

type Props = {
  open: boolean;
  event: EventDoc | null;
  onClose: () => void;
  onRSVP?: (status: 'going'|'not_going'|'maybe') => Promise<void> | void;
  quickEnabled?: boolean;
};

const RSVPModal: React.FC<Props> = ({ open, event, onClose, onRSVP, quickEnabled = true }) => {
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) setBusy(false); }, [open]);
  if (!open || !event) return null;

  async function handle(status: 'going'|'not_going'|'maybe') {
    try {
      setBusy(true);
      await onRSVP?.(status);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">RSVP: {event.title}</h3>
          <button onClick={onClose} className="p-2 rounded hover:bg-gray-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {quickEnabled && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Quick RSVP</h4>
              <div className="flex gap-2">
                <button disabled={busy} onClick={()=>handle('going')} className="px-3 py-2 rounded bg-green-600 text-white disabled:opacity-50">Going</button>
                <button disabled={busy} onClick={()=>handle('maybe')} className="px-3 py-2 rounded bg-yellow-500 text-white disabled:opacity-50">Maybe</button>
                <button disabled={busy} onClick={()=>handle('not_going')} className="px-3 py-2 rounded bg-gray-600 text-white disabled:opacity-50">Not going</button>
              </div>
            </div>
          )}

          <div className="border-t pt-4 text-sm text-gray-600">
            You can change your RSVP later from your profile.
          </div>
        </div>
      </div>
    </div>
  );
  return ReactDOM.createPortal(body, document.body);
};

export default RSVPModal;
