import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db, storage } from '../../config/firebase';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, setDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import type { ExerciseDoc, EquipmentFamily, MovementFamily } from '../../types/exercise';

const MOVEMENTS: MovementFamily[] = ['squat','hinge','lunge','push','pull','carry','core','mobility','cardio','other'];
const EQUIPMENT: EquipmentFamily[] = ['bodyweight','dumbbells','barbell','kettlebell','bands','machines','bench','box','medicine_ball','other'];

export default function ExercisesAdmin() {
  const { currentUser } = useAuth();
  const [exercises, setExercises] = useState<ExerciseDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<ExerciseDoc>({
    canonicalName: '',
    slug: '',
    movementFamily: 'other',
    primaryMuscles: [],
    environments: ['home','gym'],
    requiredEquipment: ['bodyweight'],
    media: {},
    status: 'draft'
  });
  const [posterPreview, setPosterPreview] = useState<string | undefined>(undefined);
  const [loopPreview, setLoopPreview] = useState<string | undefined>(undefined);
  const isAdmin = currentUser?.role === 'admin';
  const isEditor = isAdmin || (currentUser as any)?.role === 'trainer' || (currentUser as any)?.canEditExercises;

  const canUse = !!currentUser && isEditor;

  useEffect(() => {
    (async () => {
      const q = query(collection(db as any, 'exercises'), orderBy('canonicalName'));
      const snap = await getDocs(q);
      setExercises(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as ExerciseDoc[]);
    })();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const path = form.media?.posterPath;
        const url = path ? await getDownloadURL(ref(storage as any, path)) : undefined;
        if (mounted) setPosterPreview(url);
      } catch { if (mounted) setPosterPreview(undefined); }
      try {
        const path = form.media?.loopPath;
        const url = path ? await getDownloadURL(ref(storage as any, path)) : undefined;
        if (mounted) setLoopPreview(url);
      } catch { if (mounted) setLoopPreview(undefined); }
    })();
    return () => { mounted = false; };
  }, [form.media?.posterPath, form.media?.loopPath]);

  const onUpload = async (file: File, path: string) => {
    const r = ref(storage as any, path);
    const task = uploadBytesResumable(r, file, { contentType: file.type });
    await new Promise<void>((resolve, reject) => {
      task.on('state_changed', undefined, reject, () => resolve());
    });
    return { path: r.fullPath, url: await getDownloadURL(task.snapshot.ref) };
  };

  const save = async () => {
    if (!canUse) return;
    if (!form.slug || !form.canonicalName) return;
    const id = form.slug;
    await setDoc(doc(db as any, 'exercises', id), {
      ...form,
      slug: id,
      canonicalName: form.canonicalName.trim(),
      status: form.status || 'draft',
      lastReviewedAt: new Date(),
    }, { merge: true });
    // refresh list
    const snap = await getDocs(query(collection(db as any, 'exercises'), orderBy('canonicalName')));
    setExercises(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as ExerciseDoc[]);
  };

  if (!canUse) {
    return <div className="max-w-4xl mx-auto p-6">Editor only</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Exercise Library (Admin)</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white/80 border rounded-xl p-4">
          <h2 className="font-semibold mb-3">New / Edit Exercise</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Slug (unique id)</label>
              <input className="w-full border rounded px-3 py-2" value={form.slug}
                onChange={(e)=> setForm(v=>({ ...v, slug: e.target.value.toLowerCase().replace(/\s+/g,'-') }))} />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Canonical Name</label>
              <input className="w-full border rounded px-3 py-2" value={form.canonicalName}
                onChange={(e)=> setForm(v=>({ ...v, canonicalName: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Movement Family</label>
              <select className="w-full border rounded px-3 py-2" value={form.movementFamily}
                onChange={(e)=> setForm(v=>({ ...v, movementFamily: e.target.value as MovementFamily }))}>
                {MOVEMENTS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Required Equipment</label>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT.map(eq => (
                  <label key={eq} className={`px-2 py-1 rounded border text-xs cursor-pointer ${form.requiredEquipment?.includes(eq) ? 'bg-black text-white' : ''}`}>
                    <input type="checkbox" className="hidden"
                      checked={!!form.requiredEquipment?.includes(eq)}
                      onChange={(e) => {
                        setForm(v => {
                          const set = new Set(v.requiredEquipment || []);
                          if (e.target.checked) set.add(eq); else set.delete(eq);
                          return { ...v, requiredEquipment: Array.from(set) as EquipmentFamily[] };
                        });
                      }} />
                    {eq}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Instructions (one per line)</label>
              <textarea className="w-full border rounded px-3 py-2 h-28" value={(form.instructions || []).join('\n')}
                onChange={(e)=> setForm(v=>({ ...v, instructions: e.target.value.split('\n').map(s=>s.trim()).filter(Boolean) }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Poster / Raw Media Upload</label>
                <input type="file" accept="image/*" onChange={async (e)=>{
                  const f = e.target.files?.[0]; if (!f || !form.slug) return;
                  setLoading(true);
                  try {
                    const out = await onUpload(f, `exercise-media/uploads/${form.slug}/${f.name}`);
                    setForm(v=> ({ ...v, media: { ...(v.media||{}), rawUploadPath: out.path } }));
                  } finally { setLoading(false); }
                }} />
                {posterPreview && (
                  <img src={posterPreview} className="mt-2 w-32 h-24 object-cover rounded" />
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Loop / Raw Video Upload (3–5s)</label>
                <input type="file" accept="video/*" onChange={async (e)=>{
                  const f = e.target.files?.[0]; if (!f || !form.slug) return;
                  setLoading(true);
                  try {
                    const out = await onUpload(f, `exercise-media/uploads/${form.slug}/${f.name}`);
                    setForm(v=> ({ ...v, media: { ...(v.media||{}), rawUploadPath: out.path } }));
                  } finally { setLoading(false); }
                }} />
                {loopPreview && (
                  <video src={loopPreview} className="mt-2 w-32 h-24 object-cover rounded" autoPlay muted loop playsInline />
                )}
              </div>
            </div>

            <div className="text-xs text-gray-500">
              Uploads go to <code>exercise-media/uploads/{'{slug}'}</code>. A Cloud Function generates poster, loop, and HLS into
              <code> exercise-media/processed/{'{slug}'}</code> and updates the exercise doc. If you don't see previews yet, they are still processing.
            </div>

            <div className="flex items-center gap-2">
              <button onClick={save} disabled={loading || !form.slug || !form.canonicalName}
                className="px-4 py-2 rounded bg-[#F25129] text-white disabled:opacity-60">Save</button>
              <select className="border rounded px-2 py-1 text-sm" value={form.status || 'draft'}
                onChange={(e)=> setForm(v=>({ ...v, status: e.target.value as any }))}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white/80 border rounded-xl p-4">
          <h2 className="font-semibold mb-3">Exercises ({exercises.length})</h2>
          <div className="divide-y">
            {exercises.map((e) => (
              <div key={e.id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{e.canonicalName} <span className="text-xs text-gray-500">({e.slug})</span></div>
                  <div className="text-xs text-gray-600">{e.movementFamily} • {(e.requiredEquipment||[]).join(', ')}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="px-2 py-1 rounded text-xs border" onClick={()=> setForm(e)}>Edit</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {isAdmin && (
          <div className="bg-white/80 border rounded-xl p-4 md:col-span-2">
            <h2 className="font-semibold mb-3">Access Control</h2>
            <AccessControlPanel />
          </div>
        )}
      </div>
    </div>
  );
}

function AccessControlPanel() {
  const [email, setEmail] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [editors, setEditors] = React.useState<any[]>([]);

  const findUserByEmail = async (email: string) => {
    const q = query(collection(db as any, 'users'), where('email', '==', email));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...(d.data() as any) };
  };

  const grant = async (role: 'trainer'|'admin'|'member', canEdit?: boolean) => {
    setSaving(true);
    try {
      const u = await findUserByEmail(email.trim().toLowerCase());
      if (!u) { alert('User not found'); return; }
      await setDoc(doc(db as any, 'users', u.id), { role, canEditExercises: !!canEdit, updatedAt: new Date() } as any, { merge: true });
      alert('Updated');
    } finally { setSaving(false); }
  };

  const loadEditors = async () => {
    const usersCol = collection(db as any, 'users');
    const a = await getDocs(query(usersCol, where('canEditExercises', '==', true)));
    const b = await getDocs(query(usersCol, where('role', '==', 'trainer')));
    const map = new Map<string, any>();
    a.docs.forEach(d => map.set(d.id, { id: d.id, ...(d.data() as any) }));
    b.docs.forEach(d => map.set(d.id, { id: d.id, ...(d.data() as any) }));
    setEditors(Array.from(map.values()));
  };

  React.useEffect(() => { loadEditors(); }, []);

  const revoke = async (id: string) => {
    setSaving(true);
    try {
      await setDoc(doc(db as any, 'users', id), { canEditExercises: false, role: 'member', updatedAt: new Date() } as any, { merge: true });
      await loadEditors();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm text-gray-600 mb-1">User email</label>
      <input className="w-full border rounded px-3 py-2" value={email} onChange={(e)=> setEmail(e.target.value)} placeholder="trainer@example.com" />
      <div className="flex items-center gap-2 mt-2">
        <button disabled={saving} onClick={()=> grant('trainer', true)} className="px-3 py-1.5 rounded border">Grant Trainer</button>
        <button disabled={saving} onClick={()=> grant('member', false)} className="px-3 py-1.5 rounded border">Revoke Editor</button>
      </div>
      <div className="text-xs text-gray-500">Admins always retain access.</div>
      <div className="mt-3">
        <div className="text-sm font-semibold">Current Editors/Trainers</div>
        {editors.length ? (
          <div className="mt-1 divide-y">
            {editors.map((u) => (
              <div key={u.id} className="py-1.5 flex items-center justify-between">
                <div className="text-xs text-gray-700">
                  {u.displayName || u.email || u.id} • {u.role || 'member'} {u.canEditExercises ? '• editor' : ''}
                </div>
                <button disabled={saving} onClick={()=> revoke(u.id)} className="text-xs px-2 py-1 rounded border">Revoke</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-500 mt-1">No editors yet.</div>
        )}
      </div>
    </div>
  );
}
