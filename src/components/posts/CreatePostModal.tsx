// src/components/posts/CreatePostModal.tsx
import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, FileText, Image, Lock, Globe } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFirestore } from '../../hooks/useFirestore';
import { useStorage } from '../../hooks/useStorage';
import { serverTimestamp } from 'firebase/firestore';
import { stripUndefined } from '../../utils/firestore';
import toast from 'react-hot-toast';

const postSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(10, 'Content must be at least 10 characters'),
  imageUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

type PostFormData = z.infer<typeof postSchema>;

interface CreatePostModalProps {
  onClose: () => void;
  onPostCreated: () => void;
}

const CreatePostModal: React.FC<CreatePostModalProps> = ({ onClose, onPostCreated }) => {
  const { currentUser } = useAuth();
  const { addDocument } = useFirestore();
  const { uploadFile, getStoragePath } = useStorage();

  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isPublic, setIsPublic] = useState(true); // default: public

  const canPost = useMemo(
    () => !!currentUser && (currentUser.role === 'member' || currentUser.role === 'admin'),
    [currentUser]
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<PostFormData>({
    resolver: zodResolver(postSchema),
  });

  const title = watch('title') ?? '';
  const content = watch('content') ?? '';

  const onSubmit = async (data: PostFormData) => {
    if (!currentUser) return;
    if (!canPost) {
      toast.error('Only members can create community posts.');
      return;
    }

    setIsLoading(true);
    try {
      // optional image upload
      let uploadedUrl: string | undefined;
      if (selectedFile) {
        const imagePath = getStoragePath('posts', selectedFile.name);
        uploadedUrl = await uploadFile(selectedFile, imagePath);
      }

      // Build post doc safely (NO undefined values)
      const postData = stripUndefined({
        title: data.title.trim(),
        content: data.content.trim(),
        imageUrl: uploadedUrl || (data.imageUrl?.trim() || undefined),
        authorId: currentUser.id,
        authorName: currentUser.displayName || 'Member',
        authorPhoto: currentUser.photoURL || undefined,
        isPublic,                          // visibility flag
        likes: [] as string[],
        comments: [] as any[],
        likesCount: 0,
        commentsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDocument('posts', postData);
      toast.success('Post published!');
      onPostCreated();
    } catch (error: any) {
      console.error('Error creating post:', error);
      toast.error(error?.message || 'Failed to create post');
    } finally {
      setIsLoading(false);
    }
  };

  // If user isn’t allowed to post, show a friendly message instead of the form
  if (!canPost) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
          <div className="p-6 space-y-4">
            <h2 className="text-xl font-bold text-gray-900">Members Only</h2>
            <p className="text-gray-600">
              Community posts can be created by members only. Please sign in with a member account to continue.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
              <a
                href="/login"
                className="px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                Sign in
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Create New Post</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          {/* Visibility */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPublic(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition
              ${isPublic ? 'bg-green-50 border-green-200 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              title="Visible to everyone"
            >
              <Globe className="w-4 h-4" />
              Public
            </button>
            <button
              type="button"
              onClick={() => setIsPublic(false)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition
              ${!isPublic ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              title="Visible to members only"
            >
              <Lock className="w-4 h-4" />
              Private (members)
            </button>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Post Title
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                {...register('title')}
                type="text"
                className={`w-full pl-10 pr-4 py-3 rounded-lg border ${
                  errors.title ? 'border-red-300' : 'border-gray-300'
                } focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200`}
                placeholder="What's on your mind?"
              />
            </div>
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>{title.trim().length} chars</span>
              {errors.title && <span className="text-red-600">{errors.title.message}</span>}
            </div>
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Content
            </label>
            <textarea
              {...register('content')}
              rows={6}
              className={`w-full px-4 py-3 rounded-lg border ${
                errors.content ? 'border-red-300' : 'border-gray-300'
              } focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200`}
              placeholder="Share your thoughts, experiences, or ask questions..."
            />
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>{content.trim().length} chars</span>
              {errors.content && <span className="text-red-600">{errors.content.message}</span>}
            </div>
          </div>

          {/* Image */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Image (optional)
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="relative">
                  <Image className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    {...register('imageUrl')}
                    type="url"
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="https://example.com/image.jpg"
                  />
                </div>
                <p className="text-xs text-gray-500">Paste an image URL</p>
              </div>

              <div className="space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500">…or upload a file</p>
              </div>
            </div>
          </div>

          {/* Submit */}
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
              {isLoading ? 'Publishing…' : 'Publish Post'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreatePostModal;