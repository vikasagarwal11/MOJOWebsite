import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Image, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFirestore } from '../../hooks/useFirestore';
import { useStorage } from '../../hooks/useStorage';
import toast from 'react-hot-toast';
import { isUserApproved } from '../../utils/userUtils';
import { createSupportTool } from '../../services/supportToolService';
import { SupportToolCategory } from '../../types/supportTools';
import { orderBy, where } from 'firebase/firestore';

const supportToolSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(100, 'Title must be 100 characters or less'),
  content: z.string()
    .min(10, 'Content must be at least 10 characters')
    .max(2000, 'Content must be 2000 characters or less'),
  categoryId: z.string().min(1, 'Category is required'),
  tags: z.string().optional(),
  imageUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  targetAudience: z.string().optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  prepTime: z.string().optional(),
  servings: z.number().positive().optional(),
});

type SupportToolFormData = z.infer<typeof supportToolSchema>;

interface CreateSupportToolModalProps {
  onClose: () => void;
  onToolCreated: () => void;
}

const CreateSupportToolModal: React.FC<CreateSupportToolModalProps> = ({ onClose, onToolCreated }) => {
  const { currentUser } = useAuth();
  const { useRealtimeCollection } = useFirestore();
  const { uploadFile, getStoragePath } = useStorage();

  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Load active categories
  const { data: categories } = useRealtimeCollection(
    'supportToolCategories',
    [where('isActive', '==', true), orderBy('order', 'asc')]
  ) as { data: SupportToolCategory[] };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SupportToolFormData>({
    resolver: zodResolver(supportToolSchema),
    defaultValues: {
      categoryId: '',
    },
  });

  const selectedCategoryId = watch('categoryId');
  const selectedCategory = categories?.find(cat => cat.id === selectedCategoryId);

  const canPost = currentUser && isUserApproved(currentUser);

  const onSubmit = async (data: SupportToolFormData) => {
    if (!currentUser || !canPost) {
      toast.error('Only approved members can create support tools.');
      return;
    }

    setIsLoading(true);
    try {
      // Upload image if selected
      let uploadedUrl: string | undefined;
      if (selectedFile) {
        const imagePath = getStoragePath('support-tools', selectedFile.name);
        uploadedUrl = await uploadFile(selectedFile, imagePath);
      }

      // Parse tags
      const tags = data.tags
        ? data.tags.split(',').map(t => t.trim()).filter(Boolean)
        : [];

      // Create tool
      await createSupportTool(
        {
          title: data.title,
          content: data.content,
          categoryId: data.categoryId,
          tags,
          imageUrl: uploadedUrl || data.imageUrl || undefined,
          targetAudience: data.targetAudience || undefined,
          difficulty: data.difficulty,
          prepTime: data.prepTime || undefined,
          servings: data.servings,
        },
        currentUser.id,
        currentUser.displayName || 'Member',
        currentUser.photoURL || undefined
      );

      toast.success('Support tool submitted! It will be reviewed before being published.');
      onToolCreated();
      onClose();
    } catch (error: any) {
      console.error('Error creating support tool:', error);
      toast.error(error?.message || 'Failed to create support tool');
    } finally {
      setIsLoading(false);
    }
  };

  // If user isn't allowed to post, show a friendly message
  if (!canPost) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Account Approval Required</h2>
            <p className="text-gray-600 mb-6">
              Your account is pending approval. You can browse support tools but cannot create them yet.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold">Create Support Tool</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          {/* Category Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              {...register('categoryId')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
            >
              <option value="">Select a category</option>
              {categories?.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {errors.categoryId && (
              <p className="mt-1 text-sm text-red-500">{errors.categoryId.message}</p>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              {...register('title')}
              type="text"
              placeholder="e.g., Avocado Toast for 5-Year-Olds"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
            />
            {errors.title && (
              <p className="mt-1 text-sm text-red-500">{errors.title.message}</p>
            )}
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Content <span className="text-red-500">*</span>
            </label>
            <textarea
              {...register('content')}
              rows={6}
              placeholder="Share your recipe, exercise, or tip..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
            />
            {errors.content && (
              <p className="mt-1 text-sm text-red-500">{errors.content.message}</p>
            )}
          </div>

          {/* Category-specific fields */}
          {selectedCategory && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
              {selectedCategory.fields?.showPrepTime && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Prep Time
                  </label>
                  <input
                    {...register('prepTime')}
                    type="text"
                    placeholder="e.g., 15 minutes"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                  />
                </div>
              )}
              {selectedCategory.fields?.showServings && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Servings
                  </label>
                  <input
                    {...register('servings', { valueAsNumber: true })}
                    type="number"
                    min="1"
                    placeholder="e.g., 4"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                  />
                </div>
              )}
              {selectedCategory.fields?.showDifficulty && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Difficulty
                  </label>
                  <select
                    {...register('difficulty')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                  >
                    <option value="">Select difficulty</option>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Target Audience */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target Audience (optional)
            </label>
            <input
              {...register('targetAudience')}
              type="text"
              placeholder="e.g., 5-year-old kids, new moms, all"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tags (comma-separated)
            </label>
            <input
              {...register('tags')}
              type="text"
              placeholder="e.g., avocado, breakfast, quick, 5-year-old"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500">Separate tags with commas</p>
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Image (optional)
            </label>
            <div className="flex gap-4">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
              />
              {selectedFile && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Image className="w-4 h-4" />
                  <span>{selectedFile.name}</span>
                </div>
              )}
            </div>
            <div className="mt-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Or paste image URL
              </label>
              <input
                {...register('imageUrl')}
                type="url"
                placeholder="https://example.com/image.jpg"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
              />
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white rounded-lg hover:from-[#E0451F] hover:to-[#E55A2A] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateSupportToolModal;






