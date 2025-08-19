import React, { useMemo, useState } from 'react';
import { Upload, Image, Video, Filter, Camera } from 'lucide-react';
import { orderBy } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useFirestore } from '../hooks/useFirestore';
import MediaUploadModal from '../components/media/MediaUploadModal';
import MediaCard from '../components/media/MediaCard';

const Media: React.FC = () => {
  const { currentUser } = useAuth();
  const { useRealtimeCollection } = useFirestore();

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Media Gallery</h1>
          <p className="text-gray-600 text-lg">Share and explore moments from our fitness community</p>
        </div>

        {currentUser && (
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="mt-4 md:mt-0 flex items-center px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-full hover:from-purple-700 hover:to-pink-700 transition-all duration-300 transform hover:scale-105 shadow-lg"
          >
            <Upload className="w-5 h-5 mr-2" />
            Upload Media
          </button>
        )}
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
                  ? 'bg-white text-purple-600 shadow-sm'
                  : 'text-gray-600 hover:text-purple-600'
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
          className="px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
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
        {filteredMedia.map((media: any) => (
          <MediaCard key={media.id} media={media} />
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
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-full hover:from-purple-700 hover:to-pink-700 transition-all duration-300 transform hover:scale-105"
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
    </div>
  );
};

export default Media;
