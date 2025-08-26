import React, { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

type Props = { onClose: () => void; };

const EventFormModal: React.FC<Props> = ({ onClose }) => {
  const { currentUser } = useAuth();
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState('');
  const [visibility, setVisibility] = useState<'public'|'members'|'private'>('public');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!currentUser) throw new Error('Sign in first');
      await addDoc(collection(db, 'events'), {
        title,
        startAt: new Date(startAt),
        visibility,
        createdBy: currentUser.id,
        createdAt: serverTimestamp(),
      });
      toast.success('Event created');
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to create event');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 shadow max-w-md w-full">
        <h2 className="text-lg font-semibold mb-4">Create Event</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-sm block mb-1">Title</label>
            <input value={title} onChange={(e)=>setTitle(e.target.value)} className="w-full rounded border px-3 py-2" required />
          </div>
          <div>
            <label className="text-sm block mb-1">Start</label>
            <input type="datetime-local" value={startAt} onChange={(e)=>setStartAt(e.target.value)} className="w-full rounded border px-3 py-2" required />
          </div>
          <div>
            <label className="text-sm block mb-1">Visibility</label>
            <select value={visibility} onChange={(e)=>setVisibility(e.target.value as any)} className="w-full rounded border px-3 py-2">
              <option value="public">Public</option>
              <option value="members">Members</option>
              <option value="private">Private</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded border">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded bg-purple-600 text-white">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default EventFormModal;
