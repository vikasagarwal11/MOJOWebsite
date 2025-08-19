import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Upload, Image, FileText, Tag } from 'lucide-react';
import { MediaFile, Event } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useFirestore } from '../../hooks/useFirestore';
import { useStorage } from '../../hooks/useStorage';

const mediaSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  eventId: z.string().optional(),
  file: z.any().refine((files) => files?.length === 1, 'Please select a file'),
});

type MediaFormData = z.infer<typeof mediaSchema>;

interface MediaUploadModalProps {
  events: Event[];
  onClose: () => void;
  onMediaUploaded: () => void;
}

const MediaUploadModal: React.FC<MediaUploadModalProps> = ({ events, onClose, onMediaUploaded }) => {
  const { currentUser } = useAuth();
  const { addDocument } = useFirestore();
  const { uploadFile, getStoragePath } = useStorage();
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<MediaFormData>({
    resolver: zodResolver(mediaSchema),
  });

  const watchedFile = watch('file');

  React.useEffect(() => {
    if (watchedFile && watchedFile[0]) {
      const file = watchedFile[0];
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreview(null);
    }
  }, [watchedFile]);

  const onSubmit = async (data: MediaFormData) => {
    if (!currentUser) return;

    setIsLoading(true);
    try {
      const file = data.file[0];
      
      // Upload file to Firebase Storage
      const filePath = getStoragePath('media', file.name);
      const downloadURL = await uploadFile(file, filePath);
      
      const fileType = file.type.startsWith('image/') ? 'image' : 'video';
      const selectedEvent = events.find(e => e.id === data.eventId);
      
      const mediaData = {
        title: data.title,
        description: data.description,
        type: fileType,
        url: downloadURL,
        eventId: data.eventId,
        eventTitle: selectedEvent?.title,
        uploadedBy: currentUser.id,
        uploaderName: currentUser.displayName,
        likes: [],
        comments: [],
      };

      await addDocument('media', mediaData);
      onMediaUploaded();
    } catch (error) {
      console.error('Error uploading media:', error);
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
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Choose File
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-purple-400 transition-colors">
              <input
                {...register('file')}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                {preview ? (
                  <div className="space-y-4">
                    <img
                      src={preview}
                      alt="Preview"
                      className="max-h-48 mx-auto rounded-lg"
                    />
                    <p className="text-sm text-gray-600">Click to change file</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                    <div>
                      <p className="text-lg font-medium text-gray-700">Upload your media</p>
                      <p className="text-sm text-gray-500">Drag and drop or click to browse</p>
                    </div>
                  </div>
                )}
              </label>
            </div>
            {errors.file && (
              <p className="mt-1 text-sm text-red-600">{errors.file.message}</p>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
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
              <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description (Optional)
            </label>
            <textarea
              {...register('description')}
              rows={3}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
              placeholder="Describe your media..."
            />
          </div>

          {/* Event Tag */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tag with Event (Optional)
            </label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <select
                {...register('eventId')}
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
              >
                <option value="">No event tag</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
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
              {isLoading ? 'Uploading...' : 'Upload Media'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MediaUploadModal;