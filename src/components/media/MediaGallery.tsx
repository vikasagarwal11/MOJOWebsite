import React, { useMemo, useState, useEffect } from 'react';
import InfiniteScroll from 'react-infinite-scroll-component';
import { orderBy, doc, getDoc } from 'firebase/firestore';
import { useFirestore } from '../../hooks/useFirestore';
import MediaCard from './MediaCard';
import MediaLightbox from './MediaLightbox';
import MediaUploadModal from './MediaUploadModal';
import { useMediaFilters } from '../../hooks/useMediaFilters';
import { useLightbox } from '../../hooks/useLightbox';
import { Image, Video, Filter, Search, Upload, X } from 'lucide-react';
import EventTypeahead from './EventTypeahead';
import UploaderTypeahead from './UploaderTypeahead';
import { db } from '../../config/firebase';

const MediaGallery: React.FC = () => {
  const { useRealtimeCollection } = useFirestore();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [uploaderLabel, setUploaderLabel] = useState<string>('');

  const { data: mediaFiles } = useRealtimeCollection('media', [orderBy('createdAt','desc')]);
  const { data: events } = useRealtimeCollection('events', []);

  const eventsForFilter = useMemo(() => {
    const toMs = (v:any)=> v instanceof Date?+v : (typeof v?.toDate==='function'? +v.toDate():0);
    return [...events].sort((a:any,b:any)=> (toMs(b.startAt||b.date)-toMs(a.startAt||b.date)));
  }, [events]);

  const filters = useMediaFilters(mediaFiles);
  
  // Fetch uploader display name for chip label
  useEffect(() => {
    if (filters.uploader === 'all') {
      setUploaderLabel('');
      return;
    }
    getDoc(doc(db, 'users', filters.uploader)).then(snap => {
      setUploaderLabel(snap.exists() ? (snap.data()?.displayName || filters.uploader) : filters.uploader);
    });
  }, [filters.uploader]);
  
  const paged = useMemo(()=> filters.filtered.slice(0, page*18), [filters.filtered, page]);

  const lb = useLightbox(paged);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Media Gallery</h1>
          <p className="text-gray-600 text-lg">Share and explore moments from our fitness community</p>
        </div>
        <button
          onClick={() => setIsUploadModalOpen(true)}
          className="mt-4 md:mt-0 flex items-center px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-full hover:from-purple-700 hover:to-pink-700 transition-all duration-300 transform hover:scale-105 shadow-lg"
        >
          <Upload className="w-5 h-5 mr-2" /> Upload Media
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="sticky top-20 z-10 mb-8">
        <div className="rounded-2xl border border-gray-200 bg-white/80 backdrop-blur-sm shadow-sm p-3 md:p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">

            {/* Type pills */}
            <div className="lg:col-span-3">
              <div className="text-xs font-medium text-gray-500 mb-1">Type</div>
              <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl h-11">
                {[
                  { key:'all',    label:'All' },
                  { key:'image',  label:'Images' },
                  { key:'video',  label:'Videos' },
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => filters.setType(f.key as any)}
                    className={`px-3 md:px-4 rounded-lg text-sm font-medium transition ${
                      filters.type===f.key
                        ? 'bg-white text-purple-600 shadow-sm'
                        : 'text-gray-600 hover:text-purple-600'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Event typeahead */}
            <div className="lg:col-span-3">
              <div className="text-xs font-medium text-gray-500 mb-1">Event</div>
              <div className="h-11">
                <EventTypeahead
                  value={filters.eventId==='all' ? {id:null,title:null}:{id:filters.eventId,title:null}}
                  onChange={(v)=>filters.setEventId(v?.id ?? 'all')}
                  seedEvents={eventsForFilter}
                />
              </div>
            </div>

            {/* Uploader typeahead */}
            <div className="lg:col-span-2">
              <div className="text-xs font-medium text-gray-500 mb-1">Uploader</div>
              <div className="h-11">
                <UploaderTypeahead
                  value={filters.uploader==='all' ? null : {id:filters.uploader}}
                  onChange={(u)=>filters.setUploader(u?.id ?? 'all')}
                  clearLabel="All Uploaders"
                />
              </div>
            </div>

            {/* Search */}
            <div className="lg:col-span-3">
              <div className="text-xs font-medium text-gray-500 mb-1">Search</div>
              <div className="flex items-center h-11 rounded-xl border border-gray-300 px-3 bg-white">
                <Search className="w-4 h-4 text-gray-400 mr-2" />
                <input
                  value={filters.search}
                  onChange={(e)=>filters.setSearch(e.target.value)}
                  placeholder="Title, description, event, uploader…"
                  className="flex-1 outline-none bg-transparent"
                />
              </div>
            </div>

            {/* Sort */}
            <div className="lg:col-span-1">
              <div className="text-xs font-medium text-gray-500 mb-1">Sort</div>
              <select
                value={filters.sort}
                onChange={(e)=>filters.setSort(e.target.value as any)}
                className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 focus:ring-2 focus:ring-purple-500"
              >
                <option value="date_desc">Newest</option>
                <option value="date_asc">Oldest</option>
                <option value="likes_desc">Most Liked</option>
              </select>
            </div>

          </div>

          {/* Active filter chips */}
          {(filters.eventId!=='all' || filters.uploader!=='all' || filters.search) && (
            <div className="flex flex-wrap gap-2 mt-3">
                             {filters.eventId!=='all' && (
                 <button
                   onClick={()=>filters.setEventId('all')}
                   className="px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-sm font-medium hover:bg-purple-100 transition-colors"
                 >
                   Event: {eventsForFilter.find(ev => ev.id === filters.eventId)?.title || filters.eventId} ×
                 </button>
               )}
               {filters.uploader!=='all' && (
                 <button
                   onClick={()=>filters.setUploader('all')}
                   className="px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-sm font-medium hover:bg-purple-100 transition-colors"
                 >
                   Uploader: {uploaderLabel || '…'} ×
                 </button>
               )}
              {filters.search && (
                <button
                  onClick={()=>filters.setSearch('')}
                  className="px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-sm font-medium hover:bg-purple-100 transition-colors"
                >
                  "{filters.search}" ×
                </button>
              )}
              <button
                onClick={() => { filters.setEventId('all'); filters.setUploader('all'); filters.setSearch(''); }}
                className="px-3 py-1 rounded-full border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>



      {/* Grid with infinite scroll */}
      <InfiniteScroll
        dataLength={paged.length}
        next={() => setPage(p => p+1)}
        hasMore={paged.length < filters.filtered.length}
        loader={<div className="text-center py-4">Loading more…</div>}
        endMessage={<div className="text-center py-4">No more media</div>}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {paged.map((m:any, i:number)=> (
          <MediaCard key={m.id} media={m} onOpen={()=>lb.open(i)} />
        ))}
      </InfiniteScroll>

      {lb.index!=null && (
        <MediaLightbox item={paged[lb.index]} onPrev={lb.prev} onNext={lb.next} onClose={lb.close} />
      )}

      {isUploadModalOpen && (
        <MediaUploadModal
          events={eventsForFilter}
          onClose={()=>setIsUploadModalOpen(false)}
          onMediaUploaded={()=>setIsUploadModalOpen(false)}
        />
      )}
    </div>
  );
};

export default MediaGallery;