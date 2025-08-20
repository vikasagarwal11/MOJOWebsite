// src/components/media/MediaUploadModal.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Upload, FileText } from 'lucide-react';
import { Event } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useFirestore } from '../../hooks/useFirestore';
import { useStorage } from '../../hooks/useStorage';
import { stripUndefined } from '../../utils/firestore';
import toast from 'react-hot-toast';
import EventTypeahead from './EventTypeahead';

const mediaSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  // file is handled by input element; we just ensure a File exists
  file: z
    .any()
    .refine((files) => files?.length === 1 && files[0] instanceof File, 'Please select a file'),
});

type MediaFormData = z.infer<typeof mediaSchema>;

interface MediaUploadModalProps {
  events: Event[];            // seed list for the typeahead
  onClose: () => void;
  onMediaUploaded: () => void;
}

const MediaUploadModal: React.FC<MediaUploadModalProps> = ({ events, onClose, onMediaUploaded }) => {
  const { currentUser } = useAuth();
  const { addDocument } = useFirestore();
  const { uploadFile, getStoragePath } = useStorage();

  const [isLoading, setIsLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Selected event from typeahead
  const [selectedEvent, setSelectedEvent] = useState<{ id: string | null; title: string | null }>({
    id: null,
    title: null,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<MediaFormData>({ resolver: zodResolver(mediaSchema) });

  const watchedFileList = watch('file');

  // Build a quick preview for the chosen file
  useEffect(() => {
    const file: File | undefined = watchedFileList?.[0];
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [watchedFileList]);

  // Small helpers
  const fileSelected: File | null = useMemo(() => {
    return watchedFileList && watchedFileList[0] instanceof File ? watchedFileList[0] : null;
  }, [watchedFileList]);

  const fileKind = useMemo<'image' | 'video' | null>(() => {
    const f = fileSelected;
    if (!f) return null;
    if (f.type.startsWith('image/')) return 'image';
    if (f.type.startsWith('video/')) return 'video';
    // crude fallback by extension
    const name = f.name.toLowerCase();
    if (/\.(png|jpe?g|gif|webp|avif)$/.test(name)) return 'image';
    if (/\.(mp4|webm|mov|m4v|mkv)$/.test(name)) return 'video';
    return null;
  }, [fileSelected]);

  const onSubmit = async (data: MediaFormData) => {
    if (!currentUser) {
      toast.error('Please sign in to upload media.');
      return;
    }
    if (!fileSelected) {
      toast.error('Select a file to upload.');
      return;
    }

    setIsLoading(true);
    try {
      // Upload to Storage
      const path = getStoragePath('media', fileSelected.name);
      const downloadURL = await uploadFile(fileSelected, path);

      // Basic metadata
      const isImage = fileKind === 'image';
      const isVideo = fileKind === 'video';

      // Build clean Firestore doc (no undefined fields)
      const mediaDoc = stripUndefined({
        title: data.title.trim(),
        titleLower: data.title.trim().toLowerCase(),
        description: data.description?.trim() || undefined,
        type: isImage ? 'image' : isVideo ? 'video' : 'other',
        url: downloadURL,
        // Until you add Cloud Function derivatives, use the same as a placeholder for images.
        thumbnailUrl: isImage ? downloadURL : undefined,
        // Event tagging from typeahead
        eventId: selectedEvent.id ?? null,
        eventTitle: selectedEvent.title ?? null,
        // Ownership
        uploadedBy: currentUser.id,
        uploaderName: currentUser.displayName || 'Member',
        isPublic: true,
        // Engagement primitives (counter fields scale better than arrays)
        likes: [] as string[],
        comments: [] as any[],
        likesCount: 0,
        commentsCount: 0,
      });

      await addDocument('media', mediaDoc);
      toast.success('Media uploaded!');
      onMediaUploaded();
    } catch (err: any) {
      console.error('Error uploading media:', err);
      toast.error(err?.message || 'Failed to upload media');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Upload Media</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          {/* File */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Choose File</label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-purple-400 transition-colors">
              <input
                {...register('file')}
                type="file"
                accept="image/*,video/*"
                id="media-file-input"
                className="hidden"
              />
              <label htmlFor="media-file-input" className="cursor-pointer block">
                {previewUrl ? (
                  <div className="space-y-4">
                    {fileKind === 'video' ? (
                      <video
                        src={previewUrl}
                        muted
                        controls
                        className="max-h-56 mx-auto rounded-lg"
                      />
                    ) : (
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="max-h-56 mx-auto rounded-lg object-cover"
                      />
                    )}
                    <p className="text-sm text-gray-600">Click to change file</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                    <div>
                      <p className="text-lg font-medium text-gray-700">Upload your media</p>
                      <p className="text-sm text-gray-500">Drag & drop or click to browse</p>
                    </div>
                  </div>
                )}
              </label>
            </div>
            {errors.file && <p className="mt-1 text-sm text-red-600">{String(errors.file.message)}</p>}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                {...register('title')}
                type="text"
                className={`w-full pl-10 pr-4 py-3 rounded-lg border ${
                  errors.title ? 'border-red-300' : 'border-gray-300'
                } focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200`}
                placeholder="Enter media title"
              />
            </div>
            {errors.title && (
              <p className="mt-1 text-sm text-red-600">{String(errors.title.message)}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Description (Optional)</label>
            <textarea
              {...register('description')}
              rows={3}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
              placeholder="Describe your media..."
            />
          </div>

          {/* Event typeahead */}
          <EventTypeahead
            value={selectedEvent}
            onChange={setSelectedEvent}
            seedEvents={events as any}
          />

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Uploading…' : 'Upload Media'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MediaUploadModal;
