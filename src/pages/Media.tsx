import React, { useMemo, useState, useEffect } from 'react';
import { Upload, Image, Video, Filter } from 'lucide-react';
// import { Video as VideoIcon } from 'lucide-react'; // PHASE 2: Re-enable live camera functionality
import { orderBy } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useFirestore } from '../hooks/useFirestore';
import MediaUploadModal from '../components/media/MediaUploadModal';
// import { LiveMediaUpload } from '../components/media/LiveMediaUpload'; // PHASE 2: Re-enable live camera functionality
import MediaCard from '../components/media/MediaCard';
import MediaLightbox from '../components/media/MediaLightbox';
import { useLightbox } from '../hooks/useLightbox';

const Media: React.FC = () => {
  const { currentUser } = useAuth();
  const { useRealtimeCollection } = useFirestore();
  
  // Media component loaded successfully

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  // const [isLiveUploadOpen, setIsLiveUploadOpen] = useState(false); // PHASE 2: Re-enable live camera functionality

  // Debug logging for modal state - PHASE 2: Re-enable live camera functionality
  // useEffect(() => {
  //   console.log('🎬 Media: isLiveUploadOpen changed to:', isLiveUploadOpen);
  //   if (isLiveUploadOpen) {
  //     console.log('🎬 Media: Modal should be open now');
  //   } else {
  //     console.log('🎬 Media: Modal closed');
  //   }
  // }, [isLiveUploadOpen]);

  // State declarations
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const [selectedEvent, setSelectedEvent] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [eventSearchQuery, setEventSearchQuery] = useState<string>('');
  const [debouncedEventSearchQuery, setDebouncedEventSearchQuery] = useState<string>('');
  const [showEventSuggestions, setShowEventSuggestions] = useState<boolean>(false);

  // Debounce search queries (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedEventSearchQuery(eventSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [eventSearchQuery]);

  // Media: keep server-side ordering by createdAt (single-field index, no composite needed)
  const { data: mediaFiles } =
    useRealtimeCollection('media', [orderBy('createdAt', 'desc')]);

  // Events: remove Firestore orderBy('date') to avoid composite index requirement.
  // Our hook will add a public==true filter for guests automatically; we'll sort in memory.
  const { data: events } =
    useRealtimeCollection('events', []); // no constraints

  // Sort events client-side (DESC) by startAt (preferred), falling back to date.
  const eventsForFilter = useMemo(() => {
    const toMillis = (v: any) =>
      v instanceof Date ? v.getTime() : (typeof v?.toDate === 'function' ? v.toDate().getTime() : 0);

    return [...events].sort((a: any, b: any) => {
      const aMs = toMillis(a?.startAt) || toMillis(a?.date);
      const bMs = toMillis(b?.startAt) || toMillis(b?.date);
      return bMs - aMs; // DESC
    });
  }, [events]);

  // Apply UI filters to media
  const filteredMedia = useMemo(() => {
    return mediaFiles.filter((m: any) => {
      const typeOk = filterType === 'all' || m.type === filterType;
      const eventOk =
        selectedEvent === 'all' ||
        m.eventId === selectedEvent ||
        (!m.eventId && selectedEvent === 'no-event');
      
      // Search functionality - search in title, description, and tags (using debounced query)
      const searchOk = debouncedSearchQuery === '' || 
        (m.title && m.title.toLowerCase().includes(debouncedSearchQuery.toLowerCase())) ||
        (m.description && m.description.toLowerCase().includes(debouncedSearchQuery.toLowerCase())) ||
        (m.tags && Array.isArray(m.tags) && m.tags.some((tag: string) => 
          tag.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
        ));
      
      return typeOk && eventOk && searchOk;
    });
  }, [mediaFiles, filterType, selectedEvent, debouncedSearchQuery]);

  // Filter events for autocomplete (using debounced query)
  const filteredEvents = useMemo(() => {
    if (debouncedEventSearchQuery === '') return eventsForFilter;
    return eventsForFilter.filter((event: any) => 
      (event.title && event.title.toLowerCase().includes(debouncedEventSearchQuery.toLowerCase())) ||
      (event.description && event.description.toLowerCase().includes(debouncedEventSearchQuery.toLowerCase())) ||
      (event.location && event.location.toLowerCase().includes(debouncedEventSearchQuery.toLowerCase())) ||
      (event.time && event.time.toLowerCase().includes(debouncedEventSearchQuery.toLowerCase()))
    );
  }, [eventsForFilter, debouncedEventSearchQuery]);

  // Lightbox functionality
  const lightbox = useLightbox(filteredMedia, { loop: true });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header - Optimized for Mobile */}
      <div className="flex items-center justify-between mb-4 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-[#F25129] to-[#FF6B35] bg-clip-text text-transparent leading-relaxed">
            Media Gallery
          </h1>
          <p className="hidden md:block text-gray-600 text-lg mt-2">Share and explore moments from our fitness community</p>
        </div>

        <div className="flex gap-2">
          {/* Mobile: Icon-only buttons */}
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center justify-center px-3 py-2 bg-gradient-to-r from-[#F25129] to-[#FF6B35] text-white font-semibold rounded-full hover:from-[#E0451F] hover:to-[#E55A2A] transition-all duration-300 transform hover:scale-105 shadow-lg md:hidden"
            title="Upload Media"
          >
            <Upload className="w-4 h-4" />
          </button>
          {/* PHASE 2: Re-enable live camera functionality */}
          {/* <button
            onClick={() => setIsLiveUploadOpen(true)}
            className="flex items-center justify-center px-3 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-full hover:from-red-600 hover:to-red-700 transition-all duration-300 transform hover:scale-105 shadow-lg md:hidden"
            title="Live Upload"
          >
            <VideoIcon className="w-4 h-4" />
          </button> */}

          {/* Desktop: Icon + Text buttons */}
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="hidden md:flex items-center justify-center px-6 py-3 bg-gradient-to-r from-[#F25129] to-[#FF6B35] text-white font-semibold rounded-full hover:from-[#E0451F] hover:to-[#E55A2A] transition-all duration-300 transform hover:scale-105 shadow-lg"
          >
            <Upload className="w-5 h-5 mr-2" />
            Upload Media
          </button>
          {/* PHASE 2: Re-enable live camera functionality */}
          {/* <button
            onClick={() => setIsLiveUploadOpen(true)}
            className="hidden md:flex items-center justify-center px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-full hover:from-red-600 hover:to-red-700 transition-all duration-300 transform hover:scale-105 shadow-lg"
          >
            <VideoIcon className="w-5 h-5 mr-2" />
            Live Upload
          </button> */}
        </div>
      </div>

      {/* Filters - Single Row with Debounced Search */}
      <div className="flex flex-row gap-2 mb-6 md:mb-8">
        {/* Type Filter - Compact for mobile */}
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg flex-shrink-0">
          {[
            { key: 'all', label: 'All', mobileLabel: 'All', icon: <Filter className="w-3 h-3" /> },
            { key: 'image', label: 'Images', mobileLabel: '📷', icon: <Image className="w-3 h-3" /> },
            { key: 'video', label: 'Videos', mobileLabel: '🎥', icon: <Video className="w-3 h-3" /> },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterType(f.key as any)}
              className={`flex items-center px-2 py-1.5 rounded-md font-medium transition-all duration-200 text-xs ${
                filterType === f.key
                  ? 'bg-white text-[#F25129] shadow-sm'
                  : 'text-gray-600 hover:text-[#F25129]'
              }`}
            >
              <span className="md:hidden">{f.mobileLabel}</span>
              <span className="hidden md:inline">{f.icon}</span>
              <span className="hidden md:inline ml-1">{f.label}</span>
            </button>
          ))}
        </div>

        {/* Global Search - Compact */}
        <div className="flex-1 relative min-w-0 max-w-xs">
          <input
            type="text"
            placeholder="🔍 Search titles, descriptions, tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:ring-offset-1 focus:border-transparent bg-white text-xs placeholder-gray-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Event Filter - Compact */}
        <div className="relative flex-1 min-w-0 max-w-48">
          <input
            type="text"
            placeholder="🎯 Search event titles, descriptions, locations..."
            value={eventSearchQuery}
            onChange={(e) => {
              setEventSearchQuery(e.target.value);
              setShowEventSuggestions(true);
              if (e.target.value === '') {
                setSelectedEvent('all');
              }
            }}
            onFocus={() => setShowEventSuggestions(true)}
            onBlur={() => setTimeout(() => setShowEventSuggestions(false), 200)}
            className="w-full px-3 py-1.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:ring-offset-1 focus:border-transparent bg-white text-xs placeholder-gray-400"
          />
          
          {/* Clear button */}
          {eventSearchQuery && (
            <button
              onClick={() => {
                setEventSearchQuery('');
                setSelectedEvent('all');
              }}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            >
              ✕
            </button>
          )}

          {/* Event Suggestions Dropdown */}
          {showEventSuggestions && filteredEvents.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
              <div
                onClick={() => {
                  setSelectedEvent('all');
                  setEventSearchQuery('');
                  setShowEventSuggestions(false);
                }}
                className="px-3 py-2 text-xs hover:bg-gray-50 cursor-pointer border-b border-gray-100"
              >
                <span className="text-gray-500">All Events</span>
              </div>
              <div
                onClick={() => {
                  setSelectedEvent('no-event');
                  setEventSearchQuery('No Event');
                  setShowEventSuggestions(false);
                }}
                className="px-3 py-2 text-xs hover:bg-gray-50 cursor-pointer border-b border-gray-100"
              >
                <span className="text-gray-500">No Event Tag</span>
              </div>
              {filteredEvents.map((event: any) => (
                <div
                  key={event.id}
                  onClick={() => {
                    setSelectedEvent(event.id);
                    setEventSearchQuery(event.title);
                    setShowEventSuggestions(false);
                  }}
                  className="px-3 py-2 text-xs hover:bg-gray-50 cursor-pointer"
                >
                  {event.title}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Current Selection Display - Compact */}
        {selectedEvent !== 'all' && (
          <div className="flex items-center gap-1 px-2 py-1.5 bg-[#F25129] text-white rounded-lg text-xs whitespace-nowrap flex-shrink-0">
            <span className="truncate max-w-20">
              {selectedEvent === 'no-event' ? 'No Event' : 
               eventsForFilter.find(e => e.id === selectedEvent)?.title || 'Unknown Event'}
            </span>
            <button
              onClick={() => {
                setSelectedEvent('all');
                setEventSearchQuery('');
              }}
              className="text-white hover:text-gray-200 text-xs"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Media Grid - Optimized for Mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
        {filteredMedia.map((media: any, index: number) => (
          <MediaCard key={media.id} media={media} onOpen={() => lightbox.open(index)} />
        ))}
        
        {/* Empty State - Compact Card Style */}
        {filteredMedia.length === 0 && (
          <div className="col-span-full">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 md:p-12 text-center">
              <Upload className="w-8 h-8 md:w-12 md:h-12 text-gray-400 mx-auto mb-3" />
              <h3 className="text-lg md:text-xl font-medium text-gray-500 mb-2">No media yet</h3>
              <p className="text-gray-400 text-sm md:text-base mb-4">
                Tap the upload button to share your fitness moments!
              </p>
              {currentUser && (
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="px-4 py-2 md:px-6 md:py-3 bg-gradient-to-r from-[#F25129] to-[#FF6B35] text-white font-semibold rounded-full hover:from-[#E0451F] hover:to-[#E55A2A] transition-all duration-300 transform hover:scale-105 text-sm md:text-base"
                >
                  Upload Media
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <MediaUploadModal
          events={eventsForFilter}
          onClose={() => setIsUploadModalOpen(false)}
          onMediaUploaded={() => setIsUploadModalOpen(false)}
        />
      )}

      {/* PHASE 2: Re-enable live camera functionality */}
      {/* Live Media Upload Modal */}
      {/* {isLiveUploadOpen && (
        <LiveMediaUpload
          onClose={() => setIsLiveUploadOpen(false)}
        />
      )} */}

      {/* Media Lightbox */}
      {lightbox.index !== null && (
        <MediaLightbox
          item={filteredMedia[lightbox.index]}
          onPrev={lightbox.prev}
          onNext={lightbox.next}
          onClose={lightbox.close}
          autoPlay={true}
          intervalMs={3500}
          pauseOnHover={true}
          autoAdvanceVideos={true}
        />
      )}

    </div>
  );
};

export default Media;
