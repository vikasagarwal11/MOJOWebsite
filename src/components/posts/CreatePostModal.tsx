// src/components/posts/CreatePostModal.tsx
import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, FileText, Image, Lock, Globe, Sparkles, Loader2, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFirestore } from '../../hooks/useFirestore';
import { useStorage } from '../../hooks/useStorage';
import { serverTimestamp } from 'firebase/firestore';
import { stripUndefined } from '../../utils/firestore';
import toast from 'react-hot-toast';
import { generatePostSuggestionsV2 as generatePostSuggestions } from '../../services/postAIService';
import { isUserApproved } from '../../utils/userUtils';

const postSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(100, 'Title must be 100 characters or less'),
  content: z.string()
    .min(10, 'Content must be at least 10 characters')
    .max(2000, 'Content must be 2000 characters or less'),
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
  
  // AI suggestions state
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const canPost = useMemo(
    () => !!currentUser && isUserApproved(currentUser) && (currentUser.role === 'member' || currentUser.role === 'admin'),
    [currentUser]
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<PostFormData>({
    resolver: zodResolver(postSchema),
  });

  const title = watch('title') ?? '';
  const content = watch('content') ?? '';

  const handleGenerateSuggestions = async () => {
    if (!currentUser) {
      toast.error('Please sign in to use AI suggestions');
      return;
    }

    setIsGenerating(true);
    setSuggestions([]);
    setShowSuggestions(true);

    try {
      const userContext = currentUser.displayName 
        ? `${currentUser.displayName}${currentUser.email ? ` (${currentUser.email})` : ''}`
        : undefined;

      const prompt = title.trim() || content.trim() || 'I want to share something with the community';

      const result = await generatePostSuggestions({
        prompt,
        userContext
      });

      if (result.success && result.suggestions && result.suggestions.length > 0) {
        setSuggestions(result.suggestions);
        toast.success(`Generated ${result.suggestions.length} suggestions!`);
      } else {
        toast.error(result.error || 'Failed to generate suggestions. Please try writing your own.');
        setShowSuggestions(false);
      }
    } catch (error: any) {
      console.error('[CreatePostModal] Error generating suggestions:', error);
      toast.error('Something went wrong. Please try again or write your own post.');
      setShowSuggestions(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUseSuggestion = (suggestion: string) => {
    // If user doesn't have a title, try to extract one from suggestion
    if (!title.trim()) {
      const lines = suggestion.split(/[.!?]\s+/);
      const firstSentence = lines[0]?.trim() || suggestion.substring(0, 60).trim();
      if (firstSentence.length <= 100) {
        setValue('title', firstSentence);
        const remaining = suggestion.substring(firstSentence.length).trim();
        if (remaining) {
          setValue('content', remaining);
        } else {
          setValue('content', suggestion);
        }
      } else {
        // First sentence too long, use as content and generate title
        setValue('content', suggestion);
        setValue('title', suggestion.substring(0, 100));
      }
    } else {
      // User has title, just update content
      setValue('content', suggestion);
    }
    setSuggestions([]);
    setShowSuggestions(false);
    toast.success('Suggestion applied! You can edit it before posting.');
  };

  const onSubmit = async (data: PostFormData) => {
    if (!currentUser) return;
    if (!canPost) {
      if (!isUserApproved(currentUser)) {
        toast.error('Your account is pending approval. You can browse posts but cannot create them yet.');
      } else {
        toast.error('Only members can create community posts.');
      }
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
        isPublic,
        moderationStatus: 'pending',
        requiresApproval: true,
        moderationReason: 'Awaiting automated moderation review',
        moderationDetectedIssues: [],
        moderationPipeline: 'auto_pending',
        likes: [] as string[],
        comments: [] as any[],
        likesCount: 0,
        commentsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDocument('posts', postData);
      
      toast.success('Post submitted! It will be reviewed before being published.');
      
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
                className="px-5 py-2 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] transition-colors"
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
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Post Title
              </label>
              <button
                type="button"
                onClick={handleGenerateSuggestions}
                disabled={isGenerating}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F25129] to-[#FFC107] px-4 py-1.5 text-xs font-semibold text-white shadow-md transition-all duration-300 hover:from-[#E0451F] hover:to-[#E55A2B] hover:shadow-lg hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3" />
                    <span>Help me write</span>
                  </>
                )}
              </button>
            </div>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                {...register('title')}
                type="text"
                className={`w-full pl-10 pr-4 py-3 rounded-lg border ${
                  errors.title ? 'border-red-300' : 'border-gray-300'
                } focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200`}
                placeholder="What's on your mind?"
              />
            </div>
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span className={title.trim().length > 100 ? 'text-red-600' : ''}>
                {title.trim().length}/100 chars
              </span>
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
              } focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200`}
              placeholder="Share your thoughts, experiences, or ask questions... Or click 'Help me write' for AI suggestions!"
            />
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span className={content.trim().length > 2000 ? 'text-red-600' : ''}>
                {content.trim().length}/2000 chars
              </span>
              {errors.content && <span className="text-red-600">{errors.content.message}</span>}
            </div>

            {/* AI Suggestions Display */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="mt-4 space-y-3 rounded-xl border border-[#F25129]/30 bg-gradient-to-br from-[#F25129]/10 to-[#FFC107]/10 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[#F25129]" />
                    <span className="text-sm font-semibold text-[#F25129]">AI Suggestions</span>
                    <span className="text-xs text-[#F25129]/70">({suggestions.length} options)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSuggestions(false);
                      setSuggestions([]);
                    }}
                    className="rounded-full p-1 text-[#F25129]/60 hover:bg-[#F25129]/20 hover:text-[#F25129] transition"
                    aria-label="Close suggestions"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleUseSuggestion(suggestion)}
                      className="w-full text-left rounded-lg border border-[#F25129]/30 bg-white p-3 hover:border-[#F25129] hover:bg-[#F25129]/5 transition group"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white flex items-center justify-center text-xs font-semibold">
                          {index + 1}
                        </span>
                        <p className="flex-1 text-sm text-gray-700 group-hover:text-[#F25129]">
                          {suggestion}
                        </p>
                        <Check className="h-4 w-4 text-[#F25129] opacity-0 group-hover:opacity-100 transition" />
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[#F25129]/70 italic">
                  💡 Click any suggestion to use it, or write your own!
                </p>
              </div>
            )}
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
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
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
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
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
              className="px-6 py-3 bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white font-semibold rounded-lg hover:from-[#E0451F] hover:to-[#E55A2A] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
