
import React from 'react';
import { EventDoc, Visibility } from '../hooks/useEvents';
import { tsToDate } from '../lib/firestore';

type Props = {
  open: boolean;
  initial?: Partial<EventDoc>;
  onClose: () => void;
  onSubmit: (payload: Partial<EventDoc>) => Promise<void>;
};

const visOptions: Visibility[] = ['public', 'members', 'private'];

export const EventFormModal: React.FC<Props> = ({ open, initial, onClose, onSubmit }) => {
  const [form, setForm] = React.useState<Partial<EventDoc>>(() => ({
    title: '',
    description: '',
    startAt: (initial?.startAt ? tsToDate(initial.startAt) : new Date()) as any,
    endAt: (initial?.endAt ? tsToDate(initial.endAt) : new Date(Date.now()+60*60*1000)) as any,
    allDay: initial?.allDay || false,
    location: initial?.location || '',
    visibility: (initial?.visibility || 'members') as any,
    tags: initial?.tags || [],
    imageUrl: initial?.imageUrl || null,
    isPaid: initial?.isPaid || false,
    priceCents: initial?.priceCents || null,
    currency: initial?.currency || 'USD',
    capacity: initial?.capacity || null,
    recurrence: initial?.recurrence || undefined,
  }));

  React.useEffect(() => {
    if (!open) return;
    setForm(f => ({...f, ...(initial || {})}));
    // eslint-disable-next-line
  }, [open, initial?.id]);

  const set = (k: keyof EventDoc, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const submit = async () => {
    const payload: Partial<EventDoc> = {
      ...form,
      title: form.title?.trim() || '',
      description: form.description || '',
      startAt: form.startAt as any,
      endAt: form.endAt as any,
      allDay: !!form.allDay,
      location: form.location || '',
      visibility: (form.visibility || 'members') as any,
      tags: form.tags || [],
      imageUrl: form.imageUrl ?? null,
      isPaid: !!form.isPaid,
      priceCents: form.isPaid ? (Number(form.priceCents) || 0) : null,
      currency: form.isPaid ? (form.currency || 'USD') : null,
      capacity: form.capacity ? Number(form.capacity) : null,
    };
    await onSubmit(payload);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[999]">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-xl overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-semibold">{initial?.id ? 'Edit Event' : 'Create Event'}</h2>
          <button className="px-3 py-1 rounded bg-gray-200" onClick={onClose}>Close</button>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Title</span>
            <input className="border rounded px-3 py-2" value={form.title||''} onChange={e=>set('title', e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-sm font-medium">Description</span>
            <textarea className="border rounded px-3 py-2" rows={3} value={form.description||''} onChange={e=>set('description', e.target.value)} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Start</span>
            <input type="datetime-local" className="border rounded px-3 py-2"
              value={new Date(form.startAt as any).toISOString().slice(0,16)}
              onChange={(e)=>set('startAt', new Date(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">End</span>
            <input type="datetime-local" className="border rounded px-3 py-2"
              value={new Date(form.endAt as any).toISOString().slice(0,16)}
              onChange={(e)=>set('endAt', new Date(e.target.value))} />
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!form.allDay} onChange={e=>set('allDay', e.target.checked)} />
            <span className="text-sm">All day</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Location</span>
            <input className="border rounded px-3 py-2" value={form.location||''} onChange={e=>set('location', e.target.value)} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Visibility</span>
            <select className="border rounded px-3 py-2" value={form.visibility as any} onChange={e=>set('visibility', e.target.value as any)}>
              {visOptions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Tags (comma separated)</span>
            <input className="border rounded px-3 py-2" value={(form.tags||[]).join(', ')}
              onChange={e=>set('tags', e.target.value.split(',').map(s=>s.trim()).filter(Boolean))} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Image URL (optional)</span>
            <input className="border rounded px-3 py-2" value={form.imageUrl||''} onChange={e=>set('imageUrl', e.target.value||null)} />
          </label>

          <div className="md:col-span-2 border-t pt-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!form.isPaid} onChange={e=>set('isPaid', e.target.checked)} />
              <span className="text-sm font-medium">Paid event</span>
            </label>
            {form.isPaid && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Price (cents)</span>
                  <input type="number" className="border rounded px-3 py-2" value={Number(form.priceCents||0)}
                    onChange={e=>set('priceCents', Number(e.target.value||0))} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Currency</span>
                  <input className="border rounded px-3 py-2" value={form.currency||'USD'} onChange={e=>set('currency', e.target.value||'USD')} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Capacity (people)</span>
                  <input type="number" className="border rounded px-3 py-2" value={Number(form.capacity||0)}
                    onChange={e=>set('capacity', e.target.value ? Number(e.target.value) : null)} />
                </label>
              </div>
            )}
          </div>

          <div className="md:col-span-2 mt-2">
            <span className="text-sm font-medium">Recurrence (RRULE)</span>
            <input className="border rounded px-3 py-2 w-full mt-1" placeholder="e.g. FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6"
              value={form.recurrence?.rrule || ''}
              onChange={e=>set('recurrence', e.target.value ? { ...(form.recurrence||{}), rrule: e.target.value } : undefined)} />
            <small className="text-gray-500">Leave empty for one-time events. Examples: FREQ=DAILY;COUNT=5 — FREQ=WEEKLY;BYDAY=TU,TH</small>
          </div>
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button className="px-4 py-2 rounded bg-gray-200" onClick={onClose}>Cancel</button>
          <button className="px-4 py-2 rounded bg-indigo-600 text-white" onClick={submit}>
            {initial?.id ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};
