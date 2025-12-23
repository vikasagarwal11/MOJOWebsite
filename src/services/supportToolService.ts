import { collection, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { stripUndefined } from '../utils/firestore';
import { CreateSupportToolData, SupportToolCategory } from '../types/supportTools';

/**
 * Create a new support tool
 * Inherits isPublic from category's allowPublicRead
 */
export async function createSupportTool(
  data: CreateSupportToolData,
  authorId: string,
  authorName: string,
  authorPhoto?: string
): Promise<string> {
  // Get category to inherit allowPublicRead and other metadata
  const categoryRef = doc(db, 'supportToolCategories', data.categoryId);
  const categorySnap = await getDoc(categoryRef);
  
  if (!categorySnap.exists()) {
    throw new Error('Category not found');
  }
  
  const category = categorySnap.data() as SupportToolCategory;
  
  // Build tool document
  const toolData = stripUndefined({
    title: data.title.trim(),
    content: data.content.trim(),
    categoryId: data.categoryId,
    categoryName: category.name,
    categorySlug: category.slug,
    tags: data.tags || [],
    imageUrl: data.imageUrl,
    authorId,
    authorName,
    authorPhoto,
    
    // Inherit public access from category
    isPublic: category.allowPublicRead ?? true,
    
    // Metadata
    targetAudience: data.targetAudience,
    difficulty: data.difficulty,
    prepTime: data.prepTime,
    servings: data.servings,
    
    // Engagement
    likes: [],
    likesCount: 0,
    comments: [],
    commentsCount: 0,
    viewsCount: 0,
    
    // Moderation
    moderationStatus: 'pending',
    requiresApproval: true,
    moderationReason: 'Awaiting automated moderation review',
    
    // Soft delete
    isDeleted: false,
    
    // Timestamps
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  const docRef = await addDoc(collection(db, 'supportTools'), toolData);
  return docRef.id;
}

/**
 * Generate slug from category name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-')      // Replace spaces with hyphens
    .replace(/-+/g, '-');     // Replace multiple hyphens with single
}






