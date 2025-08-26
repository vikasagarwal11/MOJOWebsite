
import React from 'react';
import { EventCalendar } from './components/EventCalendar';
import { EventList } from './components/EventList';
import { EventFormModal } from './components/EventFormModal';
import { RSVPDrawer } from './components/RSVPDrawer';
import { useEvents, EventDoc } from './hooks/useEvents';

type User = { uid: string; role?: string | null; displayName?: string; email?: string } | undefined;

export const EventsPage: React.FC<{ currentUser?: User }> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = React.useState<'upcoming' | 'past'>('upcoming');
  const [viewMode, setViewMode] = React.useState<'calendar' | 'list'>('calendar');
  const [search, setSearch] = React.useState('');
  const [vis, setVis] = React.useState<'public' | 'members' | 'private' | 'all'>('all');
  const [tag, setTag] = React.useState<string | null>(null);

  const [range, setRange] = React.useState<{ start: Date; end: Date}>({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    end: new Date(new Date().getFullYear(), new Date().getMonth()+1, 0, 23, 59, 59),
  });

  const { events, instances, loading, error, createEvent, updateEvent, deleteEvent, setRSVP } = useEvents({
    currentUser: currentUser as any,
    activeTab,
    visibilityFilter: vis,
    search,
    tag,
    range,
  });

  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<EventDoc | null>(null);
  const [rsvpOpen, setRsvpOpen] = React.useState(false);
  const [rsvpEvent, setRsvpEvent] = React.useState<EventDoc | null>(null);

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (ev: EventDoc) => { setEditing(ev); setModalOpen(true); };
  const openDetails = (ev: EventDoc) => { setRsvpEvent(ev); setRsvpOpen(true); };

  const handleSubmit = async (payload: Partial<EventDoc>) => {
    if (editing?.id) await updateEvent(editing.id, payload);
    else await createEvent({ ...payload, organizerUid: currentUser?.uid || 'anonymous' });
    setModalOpen(false);
    setEditing(null);
  };

  const handleDelete = async (ev: EventDoc) => {
    if (!ev.id) return;
    if (confirm('Delete event?')) await deleteEvent(ev.id);
  };

  return (
    <div className="max-w-7xl mx-auto p-4">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Events</h1>
          <div className="text-gray-600">Manage and discover events</div>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded bg-gray-100" onClick={()=>setViewMode(viewMode==='calendar'?'list':'calendar')}>
            {viewMode === 'calendar' ? 'List view' : 'Calendar view'}
          </button>
          {(currentUser?.role === 'admin') && (
            <button className="px-4 py-2 rounded bg-indigo-600 text-white" onClick={openCreate}>Create</button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input className="border rounded px-3 py-2 flex-1" placeholder="Search…"
          value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="border rounded px-3 py-2" value={vis} onChange={e=>setVis(e.target.value as any)}>
          <option value="all">All visibility</option>
          <option value="public">Public</option>
          <option value="members">Members</option>
          <option value="private">Private</option>
        </select>
        <input className="border rounded px-3 py-2" placeholder="Tag (exact)"
          value={tag || ''} onChange={e=>setTag(e.target.value || null)} />
        <div className="flex items-center gap-2">
          <span className="text-sm">Tab</span>
          <select className="border rounded px-2 py-1" value={activeTab} onChange={e=>setActiveTab(e.target.value as any)}>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
          </select>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-4">{error}</div>}

      {viewMode === 'calendar' ? (
        <EventCalendar
          instances={instances}
          onSelect={(base)=>openDetails(base)}
        />
      ) : (
        <EventList
          events={events}
          onEdit={openEdit}
          onDelete={handleDelete}
          onOpen={openDetails}
        />
      )}

      <EventFormModal
        open={modalOpen}
        initial={editing || undefined}
        onClose={()=>{ setModalOpen(false); setEditing(null); }}
        onSubmit={handleSubmit}
      />

      <RSVPDrawer
        open={rsvpOpen}
        event={rsvpEvent}
        currentUser={currentUser as any}
        onClose={()=>{ setRsvpOpen(false); setRsvpEvent(null); }}
        onSubmit={(r)=>setRSVP(rsvpEvent!.id!, r)}
      />
    </div>
  );
};

export default EventsPage;
