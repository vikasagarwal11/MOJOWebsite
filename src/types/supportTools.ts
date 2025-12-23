import { Comment } from './index';

export interface SupportToolCategory {
  id: string;
  name: string; // "Healthy Recipes", "Healthy Exercises", "Health Tips"
  slug: string; // "healthy-recipes", "healthy-exercises", "health-tips" (used in URL)
  description?: string;
  seoDescription?: string; // SEO-optimized description for meta tags
  seoKeywords?: string[]; // SEO keywords for this category
  icon?: string; // Emoji or icon identifier
  color?: string; // Hex color for UI
  order: number; // Display order
  isActive: boolean;
  
  // Access Control (Admin-managed)
  allowPublicRead: boolean; // If true, external users (not logged in) can view content
                          // If false, only approved platform users can view
                          // Default: true (can be changed by admin)
  
  // SEO Metadata
  seoTitle?: string; // Custom SEO title (defaults to name)
  seoImage?: string; // Category-specific image for social sharing
  
  // Category-specific fields
  fields?: {
    // For recipes
    showPrepTime?: boolean;
    showServings?: boolean;
    showIngredients?: boolean;
    // For exercises
    showDuration?: boolean;
    showDifficulty?: boolean;
    // etc.
  };
  
  createdAt: Date;
  updatedAt: Date;
  createdBy: string; // Admin who created it
}

export interface SupportTool {
  id: string;
  title: string;
  content: string; // Rich text content
  categoryId: string; // Reference to supportToolCategories
  categoryName: string; // Denormalized for easy querying
  categorySlug: string; // Denormalized slug for easy querying
  tags?: string[]; // e.g., ["5-year-old", "avocado", "breakfast"]
  imageUrl?: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  
  // Access Control
  isPublic: boolean; // Inherits from category.allowPublicRead by default
                     // Can be overridden per tool if needed (future enhancement)
  
  // Metadata
  targetAudience?: string; // e.g., "5-year-old kids", "new moms", "all"
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  prepTime?: string; // For recipes: "15 minutes"
  servings?: number; // For recipes
  
  // Engagement
  likes: string[];
  likesCount: number;
  comments: Comment[];
  commentsCount: number;
  viewsCount?: number;
  
  // Moderation (same as Posts)
  moderationStatus: 'pending' | 'approved' | 'rejected';
  requiresApproval: boolean;
  moderationReason?: string;
  
  // Soft delete
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSupportToolData {
  title: string;
  content: string;
  categoryId: string;
  tags?: string[];
  imageUrl?: string;
  targetAudience?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  prepTime?: string;
  servings?: number;
}






