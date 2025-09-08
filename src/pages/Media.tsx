import React, { useMemo, useState, useEffect } from 'react';
import { Upload, Image, Video, Filter, Camera, Video as VideoIcon } from 'lucide-react';
import { orderBy } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useFirestore } from '../hooks/useFirestore';
import MediaUploadModal from '../components/media/MediaUploadModal';
import { LiveMediaUpload } from '../components/media/LiveMediaUpload';
import MediaCard from '../components/media/MediaCard';
import MediaLightbox from '../components/media/MediaLightbox';
import { useLightbox } from '../hooks/useLightbox';

const Media: React.FC = () => {
  const { currentUser } = useAuth();
  const { useRealtimeCollection } = useFirestore();
  
  // Media component loaded successfully

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isLiveUploadOpen, setIsLiveUploadOpen] = useState(false);
  const [isModalClosing, setIsModalClosing] = useState(false);

  // Debug logging for modal state
  useEffect(() => {
    console.log('🎬 Media: isLiveUploadOpen changed to:', isLiveUploadOpen);
    if (isLiveUploadOpen) {
      console.log('🎬 Media: Modal should be open now');
    } else {
      console.log('🎬 Media: Modal closed');
    }
  }, [isLiveUploadOpen]);
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const [selectedEvent, setSelectedEvent] = useState<string>('all');

  // Media: keep server-side ordering by createdAt (single-field index, no composite needed)
  const { data: mediaFiles, loading: mediaLoading } =
    useRealtimeCollection('media', [orderBy('createdAt', 'desc')]);

  // Events: remove Firestore orderBy('date') to avoid composite index requirement.
  // Our hook will add a public==true filter for guests automatically; we’ll sort in memory.
  const { data: events, loading: eventsLoading } =
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
      return typeOk && eventOk;
    });
  }, [mediaFiles, filterType, selectedEvent]);

  // Lightbox functionality
  const lightbox = useLightbox(filteredMedia, { loop: true });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#F25129] to-[#FF6B35] bg-clip-text text-transparent leading-relaxed pb-1 mb-2">Media Gallery</h1>
          <p className="text-gray-600 text-lg">Share and explore moments from our fitness community</p>
        </div>

        <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center justify-center px-6 py-3 bg-gradient-to-r from-[#F25129] to-[#FF6B35] text-white font-semibold rounded-full hover:from-[#E0451F] hover:to-[#E55A2A] transition-all duration-300 transform hover:scale-105 shadow-lg"
          >
            <Upload className="w-5 h-5 mr-2" />
            Upload Media
          </button>
          <button
            onClick={() => setIsLiveUploadOpen(true)}
            className="flex items-center justify-center px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-full hover:from-red-600 hover:to-red-700 transition-all duration-300 transform hover:scale-105 shadow-lg"
          >
            <VideoIcon className="w-5 h-5 mr-2" />
            Live Upload
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        {/* Type Filter */}
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
          {[
            { key: 'all', label: 'All', icon: <Filter className="w-4 h-4" /> },
            { key: 'image', label: 'Images', icon: <Image className="w-4 h-4" /> },
            { key: 'video', label: 'Videos', icon: <Video className="w-4 h-4" /> },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterType(f.key as any)}
              className={`flex items-center px-4 py-2 rounded-md font-medium transition-all duration-200 ${
                filterType === f.key
                  ? 'bg-white text-[#F25129] shadow-sm'
                  : 'text-gray-600 hover:text-[#F25129]'
              }`}
            >
              {f.icon}
              <span className="ml-2">{f.label}</span>
            </button>
          ))}
        </div>

        {/* Event Filter */}
        <select
          value={selectedEvent}
          onChange={(e) => setSelectedEvent(e.target.value)}
          className="px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent bg-white"
        >
          <option value="all">All Events</option>
          <option value="no-event">No Event Tag</option>
          {eventsForFilter.map((event: any) => (
            <option key={event.id} value={event.id}>
              {event.title}
            </option>
          ))}
        </select>
      </div>

      {/* Media Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMedia.map((media: any, index: number) => (
          <MediaCard key={media.id} media={media} onOpen={() => lightbox.open(index)} />
        ))}
      </div>

      {/* Empty State */}
      {filteredMedia.length === 0 && (
        <div className="text-center py-16">
          <Camera className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-500 mb-2">No media files found</h3>
          <p className="text-gray-400 mb-6">
            Start sharing your fitness journey by uploading photos and videos!
          </p>
          {currentUser && (
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="px-6 py-3 bg-gradient-to-r from-[#F25129] to-[#FF6B35] text-white font-semibold rounded-full hover:from-[#E0451F] hover:to-[#E55A2A] transition-all duration-300 transform hover:scale-105"
            >
              Upload First Media
            </button>
          )}
        </div>
      )}

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <MediaUploadModal
          events={eventsForFilter}
          onClose={() => setIsUploadModalOpen(false)}
          onMediaUploaded={() => setIsUploadModalOpen(false)}
        />
      )}

      {/* Live Media Upload Modal */}
      {isLiveUploadOpen && (
        <LiveMediaUpload
          onClose={() => {
            setIsModalClosing(true);
            setTimeout(() => {
              setIsLiveUploadOpen(false);
              setIsModalClosing(false);
            }, 100);
          }}
        />
      )}

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
