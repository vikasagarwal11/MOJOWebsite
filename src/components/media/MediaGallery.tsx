import React, { useMemo, useState, useEffect, useRef } from 'react';
import InfiniteScroll from 'react-infinite-scroll-component';
import { orderBy, doc, getDoc } from 'firebase/firestore';
import { useFirestore } from '../../hooks/useFirestore';
import MediaCard from './MediaCard';
import MediaLightbox from './MediaLightbox';
import MediaUploadModal from './MediaUploadModal';
import { useMediaFilters } from '../../hooks/useMediaFilters';
import { useLightbox } from '../../hooks/useLightbox';
import { useFingerPreviewOnGrid } from '../../hooks/useFingerPreviewOnGrid';
import { Search, Upload } from 'lucide-react';
import EventTypeahead from './EventTypeahead';
import UploaderTypeahead from './UploaderTypeahead';
import { db } from '../../config/firebase';

const MediaGallery: React.FC = () => {
  const { useRealtimeCollection } = useFirestore();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [uploaderLabel, setUploaderLabel] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  
  // Touch detection for performance optimization
  const isTouch = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  
  // Finger preview functionality
  const gridRef = useRef<HTMLDivElement>(null);
  useFingerPreviewOnGrid(gridRef, {
    cardSelector: '[data-media-card]',
    pressDelay: 120,
    moveThreshold: 14,
    moveThrottleMs: 50,
    enableDesktopHover: !isTouch,    // Disable hover on touch devices
    hoverDelayMs: 120
  });

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

  const lb = useLightbox(paged, { loop: true });

  // NEW: Processing queue statistics - only count recent items (last 2 hours)
  const processingStats = useMemo(() => {
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const now = Date.now();

    const fresh = mediaFiles.filter((m: any) => {
      const t = (m.updatedAt?.toDate?.() ?? m.createdAt?.toDate?.() ?? m.updatedAt ?? m.createdAt ?? new Date());
      const age = Math.abs(now - +new Date(t));
      return age <= TWO_HOURS; // consider only fresh items
    });

    const stats = { processing: 0, enhancing: 0, ready: 0, failed: 0, total: fresh.length };
    
    fresh.forEach((media: any) => {
      if (media.transcodeStatus === 'processing') {
        if (media.type === 'video' && media.thumbnailPath) {
          stats.enhancing++; // Has poster, still processing HLS
        } else {
          stats.processing++; // Still in initial processing
        }
      } else if (media.transcodeStatus === 'ready') stats.ready++;
      else if (media.transcodeStatus === 'failed') stats.failed++;
    });
    
    return stats;
  }, [mediaFiles]);

  // Note: Since we're using useRealtimeCollection, the FFmpeg status updates
  // will automatically be reflected in the UI when the Cloud Function updates
  // the transcodeStatus field. The existing real-time listener will handle this.

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 md:mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#F25129] mb-2">Media Gallery</h1>
          <p className="text-gray-600 text-lg">Share and explore moments from our fitness community</p>
        </div>
        
        <div className="mt-4 md:mt-0 flex gap-2">
          <button
            onClick={() => setShowFilters(true)}
            className="md:hidden px-4 py-3 rounded-full border border-gray-300 text-gray-700 min-h-[44px]"
            aria-label="Open filters"
          >
            Filters
          </button>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center px-6 py-3 bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white font-semibold rounded-full hover:from-[#E0451F] hover:to-[#E5A900] transition-all duration-300 transform hover:scale-105 shadow-lg min-h-[44px]"
          >
            <Upload className="w-5 h-5 mr-2" /> Upload Media
          </button>
        </div>
      </div>

      {/* NEW: Processing Status Bar */}
      {(processingStats.processing > 0 || processingStats.enhancing > 0 || processingStats.failed > 0) && (
        <div className="mb-6 p-4 bg-gradient-to-r from-[#F25129]/10 to-[#FFC107]/10 rounded-xl border border-[#F25129]/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {processingStats.processing > 0 && (
                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 bg-[#F25129] rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-[#F25129]">
                    {processingStats.processing} processing
                  </span>
                </div>
              )}
              {processingStats.enhancing > 0 && (
                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 bg-[#FFC107] rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-[#FFC107]">
                    {processingStats.enhancing} enhancing
                  </span>
                </div>
              )}
              {processingStats.failed > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="text-sm font-medium text-red-700">
                    {processingStats.failed} failed
                  </span>
                </div>
              )}
            </div>
            <div className="text-xs text-gray-500">
              FFmpeg pipeline enhancing media quality in the background
            </div>
          </div>
        </div>
      )}

      {/* Desktop Filter Toolbar */}
      <div className="hidden md:block sticky z-10 bg-white/95 backdrop-blur-sm -mx-4 px-4 pt-2"
           style={{ top: 'var(--app-header-offset, 64px)' }}>
        <div className="rounded-2xl border border-gray-200 bg-white/80 backdrop-blur-sm shadow-sm p-4">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">

            {/* Type pills */}
            <div className="min-w-0">
              <div className="text-xs font-medium text-gray-500 mb-1">Type</div>
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl min-h-[44px] overflow-x-auto md:overflow-visible no-scrollbar">
                {['all','image','video'].map(k => (
                  <button
                    key={k}
                    onClick={() => filters.setType(k as any)}
                    className={`px-3 md:px-4 py-2 rounded-lg text-sm font-medium shrink-0 transition
                      ${filters.type===k ? 'bg-white text-[#F25129] shadow-sm' : 'text-gray-600 hover:text-[#F25129]'}`}
                  >
                    {k==='all'?'All':k==='image'?'Images':'Videos'}
                  </button>
                ))}
              </div>
            </div>

            {/* Event typeahead */}
            <div className="min-w-0">
              <div className="text-xs font-medium text-gray-500 mb-1">Event</div>
              <div className="min-h-[44px]">
                <EventTypeahead
                  value={filters.eventId==='all' ? {id:null,title:null}:{id:filters.eventId,title:null}}
                  onChange={(v)=>filters.setEventId(v?.id ?? 'all')}
                  seedEvents={eventsForFilter}
                />
              </div>
            </div>

            {/* Uploader typeahead */}
            <div className="min-w-0">
              <div className="text-xs font-medium text-gray-500 mb-1">Uploader</div>
              <div className="min-h-[44px]">
                <UploaderTypeahead
                  value={filters.uploader==='all' ? null : {id:filters.uploader}}
                  onChange={(u)=>filters.setUploader(u?.id ?? 'all')}
                  clearLabel="All Uploaders"
                />
              </div>
            </div>

            {/* Search */}
            <div className="min-w-0">
              <div className="text-xs font-medium text-gray-500 mb-1">Search</div>
              <label className="flex items-center min-h-[44px] rounded-xl border border-gray-300 px-3 bg-white">
                <Search className="w-4 h-4 text-gray-400 mr-2" />
                <input
                  value={filters.search}
                  onChange={(e)=>filters.setSearch(e.target.value)}
                  placeholder="Title, description, event, uploader…"
                  className="flex-1 outline-none bg-transparent min-w-0"
                />
              </label>
            </div>

            {/* Sort */}
            <div className="min-w-0">
              <div className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
                Sort
              </div>
              <select
                value={filters.sort}
                onChange={(e)=>filters.setSort(e.target.value as any)}
                className="min-h-[44px] w-full rounded-xl border border-gray-300 bg-white px-3 focus:ring-2 focus:ring-[#F25129]"
                title="Sort by date or popularity"
              >
                <option value="date_desc">Newest</option>
                <option value="date_asc">Oldest</option>
                <option value="likes_desc">Most Liked</option>
              </select>
            </div>

          </div>

          {/* Active filter chips */}
          {(filters.eventId!=='all' || filters.uploader!=='all' || filters.search) && (
            <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar py-1">
              {filters.eventId!=='all' && (
                <button
                  onClick={()=>filters.setEventId('all')}
                  className="px-3 py-1 rounded-full bg-[#F25129]/10 text-[#F25129] text-sm font-medium hover:bg-[#F25129]/20 transition-colors shrink-0"
                >
                  Event: {eventsForFilter.find(ev => ev.id === filters.eventId)?.title || filters.eventId} ×
                </button>
              )}
              {filters.uploader!=='all' && (
                <button
                  onClick={()=>filters.setUploader('all')}
                  className="px-3 py-1 rounded-full bg-[#F25129]/10 text-[#F25129] text-sm font-medium hover:bg-[#F25129]/20 transition-colors shrink-0"
                >
                  Uploader: {uploaderLabel || '…'} ×
                </button>
              )}
              {filters.search && (
                <button
                  onClick={()=>filters.setSearch('')}
                  className="px-3 py-1 rounded-full bg-[#F25129]/10 text-[#F25129] text-sm font-medium hover:bg-[#F25129]/20 transition-colors shrink-0"
                >
                  Search: "{filters.search}" ×
                </button>
              )}
              <button
                onClick={() => { filters.setEventId('all'); filters.setUploader('all'); filters.setSearch(''); }}
                className="px-3 py-1 rounded-full border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors shrink-0"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Filter Sheet */}
      {showFilters && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={()=>setShowFilters(false)} />
          <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl p-4 max-h-[80vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Filters</h3>
              <button 
                className="px-3 py-1 rounded-lg border min-h-[44px]" 
                onClick={()=>setShowFilters(false)}
              >
                Done
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Type pills */}
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-500 mb-1">Type</div>
                <div className="flex gap-1 bg-gray-100 p-1 rounded-xl min-h-[44px] overflow-x-auto no-scrollbar">
                  {['all','image','video'].map(k => (
                    <button
                      key={k}
                      onClick={() => filters.setType(k as any)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium shrink-0 transition
                        ${filters.type===k ? 'bg-white text-[#F25129] shadow-sm' : 'text-gray-600 hover:text-[#F25129]'}`}
                    >
                      {k==='all'?'All':k==='image'?'Images':'Videos'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Event typeahead */}
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-500 mb-1">Event</div>
                <div className="min-h-[44px]">
                  <EventTypeahead
                    value={filters.eventId==='all' ? {id:null,title:null}:{id:filters.eventId,title:null}}
                    onChange={(v)=>filters.setEventId(v?.id ?? 'all')}
                    seedEvents={eventsForFilter}
                  />
                </div>
              </div>

              {/* Uploader typeahead */}
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-500 mb-1">Uploader</div>
                <div className="min-h-[44px]">
                  <UploaderTypeahead
                    value={filters.uploader==='all' ? null : {id:filters.uploader}}
                    onChange={(u)=>filters.setUploader(u?.id ?? 'all')}
                    clearLabel="All Uploaders"
                  />
                </div>
              </div>

              {/* Search */}
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-500 mb-1">Search</div>
                <label className="flex items-center min-h-[44px] rounded-xl border border-gray-300 px-3 bg-white">
                  <Search className="w-4 h-4 text-gray-400 mr-2" />
                  <input
                    value={filters.search}
                    onChange={(e)=>filters.setSearch(e.target.value)}
                    placeholder="Title, description, event, uploader…"
                    className="flex-1 outline-none bg-transparent min-w-0"
                  />
                </label>
              </div>

              {/* Sort */}
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                  <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                  Sort
                </div>
                <select
                  value={filters.sort}
                  onChange={(e)=>filters.setSort(e.target.value as any)}
                  className="min-h-[44px] w-full rounded-xl border border-gray-300 bg-white px-3 focus:ring-2 focus:ring-[#F25129]"
                  title="Sort by date or popularity"
                >
                  <option value="date_desc">Newest</option>
                  <option value="date_asc">Oldest</option>
                  <option value="likes_desc">Most Liked</option>
                </select>
              </div>

              {/* Active filter chips */}
              {(filters.eventId!=='all' || filters.uploader!=='all' || filters.search) && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                  {filters.eventId!=='all' && (
                    <button
                      onClick={()=>filters.setEventId('all')}
                      className="px-3 py-1 rounded-full bg-[#F25129]/10 text-[#F25129] text-sm font-medium hover:bg-[#F25129]/20 transition-colors shrink-0"
                    >
                      Event: {eventsForFilter.find(ev => ev.id === filters.eventId)?.title || filters.eventId} ×
                    </button>
                  )}
                  {filters.uploader!=='all' && (
                    <button
                      onClick={()=>filters.setUploader('all')}
                      className="px-3 py-1 rounded-full bg-[#F25129]/10 text-[#F25129] text-sm font-medium hover:bg-[#F25129]/20 transition-colors shrink-0"
                    >
                      Uploader: {uploaderLabel || '…'} ×
                    </button>
                  )}
                  {filters.search && (
                    <button
                      onClick={()=>filters.setSearch('')}
                      className="px-3 py-1 rounded-full bg-[#F25129]/10 text-[#F25129] text-sm font-medium hover:bg-[#F25129]/20 transition-colors shrink-0"
                    >
                      Search: "{filters.search}" ×
                    </button>
                  )}
                  <button
                    onClick={() => { filters.setEventId('all'); filters.setUploader('all'); filters.setSearch(''); }}
                    className="px-3 py-1 rounded-full border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors shrink-0"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Grid with infinite scroll */}
      <div ref={gridRef} className="pt-4">
        <InfiniteScroll
          dataLength={paged.length}
          next={() => setPage(p => p+1)}
          hasMore={paged.length < filters.filtered.length}
          loader={<div className="text-center py-4">Loading more…</div>}
          endMessage={<div className="text-center py-4">No more media</div>}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
        >
          {paged.map((m:any, i:number)=> (
            <MediaCard key={m.id} media={m} onOpen={()=>lb.open(i)} />
          ))}
        </InfiniteScroll>
      </div>

      {lb.index!=null && (
        <MediaLightbox 
          item={paged[lb.index]} 
          onPrev={lb.prev} 
          onNext={lb.next} 
          onClose={lb.close}
          autoPlay={true}
          intervalMs={3500}
          pauseOnHover={true}
          autoAdvanceVideos={true}
        />
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