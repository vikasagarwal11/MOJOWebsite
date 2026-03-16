// src/components/posts/CreatePostModal.tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { serverTimestamp } from 'firebase/firestore';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, Eye, FileText, Globe, Image, Lock, Sparkles, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { useAuth } from '../../contexts/AuthContext';
import { useFirestore } from '../../hooks/useFirestore';
import { useStorage } from '../../hooks/useStorage';
import { generatePostSuggestionsV2 as generatePostSuggestions } from '../../services/postAIService';
import { stripUndefined } from '../../utils/firestore';
import { isUserApproved } from '../../utils/userUtils';
import PostCard from './PostCard';

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
  const [previewMode, setPreviewMode] = useState(false);
  
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

  const previewObjectUrl = useMemo(() => {
    if (!selectedFile) return undefined;
    return URL.createObjectURL(selectedFile);
  }, [selectedFile]);

  useEffect(() => {
    return () => {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    };
  }, [previewObjectUrl]);

  const previewPost = useMemo(
    () => ({
      id: 'preview',
      title: title.trim() || 'Post Title',
      content: content.trim() || 'Post content will appear here.',
      imageUrl: previewObjectUrl || watch('imageUrl')?.trim() || undefined,
      authorId: currentUser?.id || 'preview',
      authorName: currentUser?.displayName || 'Member',
      authorPhoto: currentUser?.photoURL || undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      likes: [],
      comments: [],
      likesCount: 0,
      commentsCount: 0,
      isPublic,
      moderationStatus: 'pending',
      requiresApproval: true,
      moderationReason: '',
      moderationDetectedIssues: [],
      moderationPipeline: '',
    }),
    [
      title,
      content,
      previewObjectUrl,
      watch,
      currentUser?.id,
      currentUser?.displayName,
      currentUser?.photoURL,
      isPublic,
    ]
  );

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <motion.div
        layout
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className={`relative w-full max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 ${
          previewMode ? 'max-w-6xl' : 'max-w-2xl'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-gray-200/70 bg-white/80 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {previewMode && (
                <button
                  type="button"
                  onClick={() => setPreviewMode(false)}
                  className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50"
                  aria-label="Back to editor"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <h2 className="truncate text-lg font-semibold text-gray-900 sm:text-xl">
                Create post
              </h2>
            </div>
            <p className="mt-0.5 hidden truncate text-sm text-gray-500 sm:block">
              Share an update with the community.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGenerateSuggestions}
              disabled={isGenerating}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60`}
              title="AI suggestions"
            >
              <Sparkles className="h-4 w-4 text-[#F25129]" />
              <span className="hidden sm:inline">AI</span>
            </button>

            <button
              type="button"
              onClick={() => setPreviewMode((v) => !v)}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition hover:bg-gray-50 ${
                previewMode ? 'ring-2 ring-[#F25129]/30' : ''
              }`}
              title={previewMode ? 'Hide preview' : 'Show preview'}
              aria-pressed={previewMode}
            >
              <Eye className={`h-5 w-5 ${previewMode ? 'text-[#F25129]' : 'text-gray-600'}`} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:bg-gray-50"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex h-[calc(90vh-56px)] flex-col overflow-hidden md:flex-row">
          {/* Editor */}
          <div className={`flex-1 overflow-y-auto ${previewMode ? 'hidden md:block' : 'block'}`}>
            <form onSubmit={handleSubmit(onSubmit)} className="px-4 py-5 space-y-6 sm:px-6 sm:py-6">
              {/* Visibility */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPublic(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition ${isPublic ? 'bg-green-50 border-green-200 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              title="Visible to everyone"
            >
              <Globe className="w-4 h-4" />
              Public
            </button>
            <button
              type="button"
              onClick={() => setIsPublic(false)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition ${!isPublic ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
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
            <div className="flex items-center justify-between gap-3 mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Content
              </label>
              <button
                type="button"
                onClick={handleGenerateSuggestions}
                disabled={isGenerating}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                title="Generate AI suggestions"
              >
                <Sparkles className="h-3.5 w-3.5 text-[#F25129]" />
                {isGenerating ? 'Generating…' : 'AI suggestions'}
              </button>
            </div>
            <textarea
              {...register('content')}
              rows={6}
              className={`w-full px-4 py-3 rounded-lg border ${
                errors.content ? 'border-red-300' : 'border-gray-300'
              } focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200`}
              placeholder="Share your thoughts, experiences, or ask questions..."
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
          <div className="flex flex-col-reverse gap-3 pt-6 border-t border-gray-200 sm:flex-row sm:justify-end sm:space-x-3">
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

          {/* Mobile preview (inside modal) */}
          <AnimatePresence mode="wait" initial={false}>
            {previewMode && (
              <motion.div
                key="mobile-preview"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.18 }}
                className="md:hidden flex-1 overflow-y-auto bg-gradient-to-br from-[#fff7f3] via-[#fffbe6] to-[#ffe3c2] px-3 py-4"
              >
                <div className="mx-auto w-full max-w-md">
                  <PostCard post={previewPost} />
                </div>

                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setPreviewMode(false)}
                    className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
                  >
                    Back to editor
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit(onSubmit)}
                    disabled={isLoading}
                    className="flex-1 rounded-xl bg-gradient-to-r from-[#F25129] to-[#FFC107] px-4 py-3 text-sm font-semibold text-white shadow hover:from-[#E0451F] hover:to-[#E55A2A] disabled:opacity-50"
                  >
                    {isLoading ? 'Publishing…' : 'Publish'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Desktop preview panel */}
          <AnimatePresence>
            {previewMode && (
              <motion.aside
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.22 }}
                className="hidden md:flex w-[420px] flex-col border-l border-b-4 border-[#F25129] border-gray-200/70 bg-gradient-to-br from-[#fff7f3] via-[#fffbe6] to-[#ffe3c2]"
              >
                <div className="flex-1 overflow-y-auto p-5 sm:p-6 pb-16 min-h-[120px]">
                  <PostCard post={previewPost} />
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default CreatePostModal;
