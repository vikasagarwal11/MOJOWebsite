import React, { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFirestore } from '../hooks/useFirestore';
import { orderBy } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { createChallenge, joinChallenge } from '../services/challengeService';

export default function Challenges() {
  const { currentUser } = useAuth();
  const { useRealtimeCollection } = useFirestore();
  const { data: challenges } = useRealtimeCollection('challenges', [orderBy('startAt','desc')]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', goal: 'sessions' as 'sessions'|'minutes', target: 7, days: 7 });

  const now = Date.now();
  const upcoming = useMemo(()=> (challenges||[]).filter((c:any)=> (c.endAt?.toDate?.()?.getTime?.() ?? c.endAt ?? 0) >= now), [challenges, now]);

  const onCreate = async () => {
    if (!currentUser) { toast.error('Sign in required'); return; }
    if (!form.title.trim()) { toast.error('Title required'); return; }
    try {
      const startAt = Date.now();
      const endAt = startAt + form.days*24*60*60*1000;
      await createChallenge({ title: form.title.trim(), goal: form.goal, target: form.target, startAt, endAt, visibility: 'members' });
      setOpen(false);
      toast.success('Challenge created');
    } catch (e:any) {
      console.error(e);
      toast.error(e?.message || 'Failed to create');
    }
  };

  const onJoin = async (id: string) => {
    try {
      await joinChallenge(id);
      toast.success('Joined');
    } catch (e:any) { toast.error(e?.message || 'Failed to join'); }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl md:text-4xl font-bold text-[#F25129]">Challenges</h1>
        <button onClick={()=> setOpen(true)} className="px-4 py-2 rounded bg-[#F25129] text-white">New Challenge</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(upcoming || []).map((c:any) => (
          <div key={c.id} className="rounded-xl border bg-white/70 p-4">
            <div className="text-lg font-semibold">{c.title}</div>
            <div className="text-xs text-gray-600 mt-1 uppercase">{c.goal} target: {c.target}</div>
            <div className="mt-3">
              <button onClick={()=> onJoin(c.id)} className="px-3 py-1.5 rounded border">Join</button>
              <a href={`/challenges/${c.id}`} className="ml-2 px-3 py-1.5 rounded bg-black text-white text-sm">View</a>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5">
            <div className="text-xl font-semibold mb-3">Create Challenge</div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Title</label>
                <input value={form.title} onChange={e=> setForm(f=>({...f, title: e.target.value}))} className="w-full border rounded px-3 py-2" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Goal</label>
                  <select value={form.goal} onChange={e=> setForm(f=>({...f, goal: e.target.value as any}))} className="w-full border rounded px-3 py-2">
                    <option value="sessions">Sessions</option>
                    <option value="minutes">Minutes</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Target</label>
                  <input type="number" value={form.target} onChange={e=> setForm(f=>({...f, target: Math.max(1, Number(e.target.value)||1)}))} className="w-full border rounded px-3 py-2" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Duration (days)</label>
                <input type="number" value={form.days} onChange={e=> setForm(f=>({...f, days: Math.max(1, Number(e.target.value)||7)}))} className="w-full border rounded px-3 py-2" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button onClick={()=> setOpen(false)} className="px-4 py-2 rounded border">Cancel</button>
              <button onClick={onCreate} className="px-4 py-2 rounded bg-black text-white">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

