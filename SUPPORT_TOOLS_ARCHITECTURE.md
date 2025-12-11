# Support Tools Architecture Recommendation

## Overview
A new "Support Tools" feature where moms can contribute and discover content organized by admin-defined categories (recipes, exercises, health tips, etc.).

## Permission Model

### Access Control Summary

**Create/Post Content:**
- ✅ Only approved platform users (members) can create content
- ❌ External users (not logged in) cannot create
- ❌ Pending/rejected users cannot create

**Read/View Content:**
- **Public Categories** (`allowPublicRead = true`):
  - ✅ Everyone can view (including external users)
  - ✅ Approved members can view
  - ✅ Pending users can view (read-only)
  
- **Members-Only Categories** (`allowPublicRead = false`):
  - ✅ Approved members can view
  - ❌ External users cannot view
  - ❌ Pending users cannot view

**Update/Delete Content:**
- ✅ Author can update/delete their own content
- ✅ Admin can update/delete any content
- ❌ Others cannot modify content

**Category Management:**
- ✅ Admin only (create, edit, delete, toggle public access)

### Admin Control
- Admin can toggle `allowPublicRead` per category
- Default: `allowPublicRead = true` (public by default)
- Change affects all tools in that category (existing and future)
- Admin can change this anytime from the admin panel

## Recommended Architecture: Single Page with Category Filters

### Why Single Page vs. Separate Menu Items?

**✅ RECOMMENDED: Single Page with Filters**
- **Better UX**: Users can browse all content types in one place, switch categories easily
- **Easier Discovery**: Users might not know which category their content fits into
- **Simpler Navigation**: One menu item instead of cluttering navigation with multiple items
- **Scalable**: Adding new categories doesn't require new routes/menu items
- **Consistent**: Matches your existing Media page pattern (filters for type/event/uploader)
- **Better Search**: Can search across all categories or filter to specific ones

**❌ NOT RECOMMENDED: Separate Menu Items**
- Clutters navigation menu
- Harder to discover content across categories
- More maintenance (new route/page per category)
- Users might post in wrong category and need to navigate

## Architecture Design

### 1. Database Structure

#### Collection: `supportTools`
```typescript
interface SupportTool {
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
```

#### Collection: `supportToolCategories` (Admin-managed)
```typescript
interface SupportToolCategory {
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
```

### 2. Page Structure & SEO-Friendly Routing

#### Routes (SEO-Optimized)
- `/support-tools` - Shows all categories (main landing page)
- `/support-tools/:categorySlug` - Category-specific pages (e.g., `/support-tools/healthy-recipes`)
- Single page component handles both routes using React Router

#### Component Structure
```
src/pages/SupportTools.tsx (handles both /support-tools and /support-tools/:categorySlug)
src/components/supportTools/
  ├── SupportToolCard.tsx
  ├── CreateSupportToolModal.tsx
  ├── SupportToolFilters.tsx
  ├── CategorySelector.tsx
  ├── SupportToolDetail.tsx (if needed)
  └── CategorySeo.tsx (SEO metadata for categories)
```

#### Routing Implementation
Update `src/App.tsx`:
```typescript
<Route path="support-tools" element={<SupportTools />} />
<Route path="support-tools/:categorySlug" element={<SupportTools />} />
```

#### URL Structure Examples
- `/support-tools` - All categories
- `/support-tools/healthy-recipes` - Healthy Recipes category
- `/support-tools/healthy-exercises` - Healthy Exercises category
- `/support-tools/health-tips` - Health Tips category
- `/support-tools/kids-nutrition` - Kids Nutrition category (if added)

### 3. Navigation & Route Updates

#### Update Header Navigation
Update `src/components/layout/Header.tsx`:
```typescript
const navigation = [
  { name: 'Home', href: '/' },
  { name: 'Events', href: '/events' },
  { name: 'Media', href: '/media' },
  { name: 'Posts', href: '/posts' },
  { name: 'Support Tools', href: '/support-tools' }, // NEW
  { name: 'About Us', href: '/about' },
  { name: 'Founder', href: '/founder' },
];
```

#### Update App Routes
Update `src/App.tsx`:
```typescript
import SupportTools from './pages/SupportTools';

// Inside Routes:
<Route path="support-tools" element={<SupportTools />} />
<Route path="support-tools/:categorySlug" element={<SupportTools />} />
```

#### Update Public Routes (for pending users)
Update `src/components/layout/Layout.tsx`:
```typescript
// Add support-tools to PUBLIC_ROUTES so pending users can view (read-only)
const PUBLIC_ROUTES = [
  '/', '/events', '/events-readonly', '/posts', '/media', '/sponsors', 
  '/founder', '/contact', '/about', '/press', '/community-guidelines',
  '/support-tools', // NEW - allow read-only access
  '/pending-approval', '/account-rejected'
];
```

### 4. How Slug Mapping Works (URL to Category)

#### The Flow: URL → Slug → Category Document

**Step 1: Admin Creates Category with Slug**
When an admin creates a category, they set the `slug` field:
```typescript
// Admin creates category in Firestore
{
  id: "cat_123",
  name: "Health Tips",
  slug: "health-tips",  // ← This is what goes in the URL
  description: "Wellness tips for moms",
  isActive: true,
  order: 3
}
```

**Step 2: React Router Extracts Slug from URL**
When user visits `/support-tools/health-tips`:
```typescript
// In SupportTools.tsx component
import { useParams } from 'react-router-dom';

const SupportTools: React.FC = () => {
  // React Router extracts "health-tips" from URL
  const { categorySlug } = useParams<{ categorySlug?: string }>();
  // categorySlug = "health-tips"
  
  // Now we need to find the category with this slug
}
```

**Step 3: Query Firestore to Find Matching Category**
```typescript
import { useFirestore } from '../hooks/useFirestore';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

const SupportTools: React.FC = () => {
  const { categorySlug } = useParams<{ categorySlug?: string }>();
  const [categories, setCategories] = useState<SupportToolCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<SupportToolCategory | null>(null);
  
  // Load all categories on mount
  useEffect(() => {
    const loadCategories = async () => {
      const categoriesRef = collection(db, 'supportToolCategories');
      const q = query(
        categoriesRef,
        where('isActive', '==', true),
        orderBy('order', 'asc')
      );
      const snapshot = await getDocs(q);
      const categoriesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SupportToolCategory[];
      setCategories(categoriesData);
    };
    loadCategories();
  }, []);
  
  // Find category matching the slug from URL
  useEffect(() => {
    if (categorySlug && categories.length > 0) {
      const found = categories.find(cat => cat.slug === categorySlug);
      setSelectedCategory(found || null);
    } else {
      setSelectedCategory(null); // Show all categories
    }
  }, [categorySlug, categories]);
  
  // Now selectedCategory contains the matching category or null
  // Use selectedCategory.name, selectedCategory.description, etc.
}
```

**Step 4: Complete Example Implementation**
```typescript
// src/pages/SupportTools.tsx
import { useParams, useNavigate } from 'react-router-dom';
import { useFirestore } from '../hooks/useFirestore';
import { orderBy, where } from 'firebase/firestore';

const SupportTools: React.FC = () => {
  const { categorySlug } = useParams<{ categorySlug?: string }>();
  const navigate = useNavigate();
  const { useRealtimeCollection } = useFirestore();
  
  // Load categories
  const { data: categories } = useRealtimeCollection(
    'supportToolCategories',
    [
      where('isActive', '==', true),
      orderBy('order', 'asc')
    ]
  );
  
  // Find category matching URL slug
  const selectedCategory = categories?.find(
    cat => cat.slug === categorySlug
  ) || null;
  
  // Load support tools filtered by category
  const { data: supportTools } = useRealtimeCollection(
    'supportTools',
    selectedCategory 
      ? [
          where('categoryId', '==', selectedCategory.id),
          where('moderationStatus', '==', 'approved'),
          orderBy('createdAt', 'desc')
        ]
      : [
          where('moderationStatus', '==', 'approved'),
          orderBy('createdAt', 'desc')
        ]
  );
  
  // Handle category tab click - updates URL
  const handleCategoryClick = (slug: string) => {
    navigate(`/support-tools/${slug}`);
  };
  
  return (
    <div>
      {/* Category tabs */}
      <div className="flex gap-2">
        <button onClick={() => navigate('/support-tools')}>
          All
        </button>
        {categories?.map(cat => (
          <button 
            key={cat.id}
            onClick={() => handleCategoryClick(cat.slug)}
            className={selectedCategory?.id === cat.id ? 'active' : ''}
          >
            {cat.name}
          </button>
        ))}
      </div>
      
      {/* Display tools */}
      {supportTools?.map(tool => (
        <SupportToolCard key={tool.id} tool={tool} />
      ))}
    </div>
  );
};
```

#### Visual Flow Diagram:
```
User visits: /support-tools/health-tips
                    ↓
React Router extracts: categorySlug = "health-tips"
                    ↓
Component queries Firestore:
  WHERE slug == "health-tips"
                    ↓
Finds category document:
  {
    id: "cat_123",
    name: "Health Tips",
    slug: "health-tips",  ← Matches!
    description: "...",
    ...
  }
                    ↓
Component uses category data:
  - Display category name
  - Show category description
  - Filter support tools by categoryId
  - Set SEO metadata
```

#### Key Points:
1. **Slug is stored in Firestore** - Each category document has a `slug` field (e.g., `"health-tips"`)
2. **React Router extracts it** - `useParams()` gets the slug from the URL (`/support-tools/:categorySlug`)
3. **Component queries Firestore** - Finds the category document where `slug === categorySlug`
4. **Admin controls slugs** - When creating/editing categories, admin sets the slug (usually auto-generated from name)
5. **Slug must be unique** - Each category needs a unique slug to avoid conflicts

#### Slug Generation (Admin UI)
```typescript
// Helper function to generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-')      // Replace spaces with hyphens
    .replace(/-+/g, '-');     // Replace multiple hyphens with single
}

// Example:
generateSlug("Health Tips") → "health-tips"
generateSlug("Healthy Recipes") → "healthy-recipes"
generateSlug("Kids' Nutrition") → "kids-nutrition"
```

#### Invalid Slug Handling
```typescript
// If slug doesn't match any category, show 404 or redirect
useEffect(() => {
  if (categorySlug && categories.length > 0) {
    const found = categories.find(cat => cat.slug === categorySlug);
    if (!found) {
      // Category not found - redirect to main page or show 404
      navigate('/support-tools', { replace: true });
      toast.error('Category not found');
    }
  }
}, [categorySlug, categories, navigate]);
```

### 5. Filtering & UI Flow (SEO-Optimized)

#### Initial View (`/support-tools`)
- Shows all categories in filter tabs
- "All" tab shows everything (default)
- Each category shows count: "Healthy Recipes (24)"
- Category tabs link to SEO-friendly URLs: `/support-tools/healthy-recipes`

#### Category Selection (`/support-tools/:categorySlug`)
- User clicks category tab → navigates to `/support-tools/healthy-recipes`
- URL is SEO-friendly and bookmarkable
- Category name highlighted in filter bar
- Page shows category-specific SEO metadata
- Breadcrumb: Home > Support Tools > Healthy Recipes

#### Creating Content
- Click "Create" button
- Modal opens with category selector dropdown
- User selects category (required)
- Form fields adapt based on category (e.g., recipes show prep time, servings)
- User fills content, adds tags, uploads image
- Submit → moderation → published
- After creation, user can stay on current category or navigate to "All"

### 5. Admin Category Management

#### Admin Panel Integration
Add to `src/pages/ProfileAdminTab.tsx` or create separate admin page:
- List all categories
- Create/edit/delete categories
- Reorder categories
- Set category-specific fields
- Activate/deactivate categories
- **Toggle `allowPublicRead`** - Enable/disable external user access per category

#### Admin UI Example for Public Access Toggle:
```typescript
// In admin category management component
const CategoryRow: React.FC<{ category: SupportToolCategory }> = ({ category }) => {
  const handleTogglePublicAccess = async () => {
    await updateDocument('supportToolCategories', category.id, {
      allowPublicRead: !category.allowPublicRead,
      updatedAt: serverTimestamp()
    });
    toast.success(
      category.allowPublicRead 
        ? 'Category is now members-only' 
        : 'Category is now publicly accessible'
    );
  };
  
  return (
    <div className="flex items-center gap-4">
      <span>{category.name}</span>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={category.allowPublicRead}
          onChange={handleTogglePublicAccess}
        />
        <span className="text-sm">
          {category.allowPublicRead ? 'Public Access' : 'Members Only'}
        </span>
      </label>
    </div>
  );
};
```

#### Default Values:
- New categories: `allowPublicRead: true` (public by default)
- Admin can change this anytime
- Change affects all tools in that category (existing and future)

### 6. Firestore Rules & Permission Model

#### Permission Model Summary:
- **Create/Post**: Only approved platform users (members) can create content
- **Read**: 
  - If category `allowPublicRead = true`: Everyone (including external users) can read approved content
  - If category `allowPublicRead = false`: Only approved platform users can read
- **Update/Delete**: Only author or admin can modify/delete
- **Category Management**: Admin only

#### Firestore Rules Implementation:

Add to `firestore.rules`:
```javascript
// Helper function to get category document
function getCategory(categoryId) {
  return get(/databases/$(database)/documents/supportToolCategories/$(categoryId)).data;
}

// Helper function to check if category allows public read
function categoryAllowsPublicRead(categoryId) {
  let cat = getCategory(categoryId);
  return cat != null && cat.allowPublicRead == true;
}

// Support Tool Categories (admin managed)
match /supportToolCategories/{categoryId} {
  allow read: if true; // Everyone can read categories (needed to check allowPublicRead)
  allow create, update, delete: if isSignedIn() && isAdmin();
}

// Support Tools
match /supportTools/{toolId} {
  allow read: if 
    // Admins can see all tools (including pending/rejected)
    (isSignedIn() && isAdmin()) ||
    // Authors can see their own tools (even if pending/rejected)
    (isSignedIn() && resource.data.authorId == request.auth.uid) ||
    // Others can only see approved tools
    ((!('moderationStatus' in resource.data) || resource.data.moderationStatus == 'approved') &&
     // Check if category allows public read OR user is approved member
     (categoryAllowsPublicRead(resource.data.categoryId) || 
      (isSignedIn() && isApprovedUser())));
  
  allow create: if isSignedIn() && 
    // Only approved users can create
    isApprovedUser() &&
    // Must be the author
    request.auth.uid == request.resource.data.authorId &&
    // Cannot be blocked
    !isUserBlockedFromRsvp(request.auth.uid) &&
    // Cannot set moderationStatus to 'approved' (only server can)
    (!('moderationStatus' in request.resource.data) || 
     request.resource.data.moderationStatus == 'pending') &&
    // Must include categoryId
    ('categoryId' in request.resource.data) &&
    // isPublic should inherit from category (set by server) or be explicitly set
    // Client can set isPublic, but server will validate against category
    true;
  
  allow update: if isSignedIn() && 
    // Author or admin can update
    (request.auth.uid == resource.data.authorId || isAdmin()) &&
    // Cannot change moderationStatus to 'approved' (only server can)
    (!('moderationStatus' in request.resource.data) ||
     request.resource.data.moderationStatus == resource.data.moderationStatus ||
     request.resource.data.moderationStatus == 'pending' ||
     isAdmin());
  
  allow delete: if isSignedIn() && 
    (request.auth.uid == resource.data.authorId || isAdmin());
  
  // Likes subcollection (same pattern as Posts)
  match /likes/{userId} {
    allow read: if true;
    allow create: if isSignedIn() && 
      isApprovedUser() &&
      request.auth.uid == userId && 
      request.resource.data.keys().hasOnly(['userId','createdAt']) && 
      request.resource.data.userId == userId;
    allow update: if false;
    allow delete: if isSignedIn() && 
      (request.auth.uid == userId || isAdmin());
  }
  
  // Comments subcollection (same pattern as Posts)
  match /comments/{commentId} {
    allow read: if 
      isAdmin() ||
      (isSignedIn() && resource.data.authorId == request.auth.uid) ||
      (!('moderationStatus' in resource.data) || resource.data.moderationStatus == 'approved');
    allow create: if isSignedIn() && 
      isApprovedUser() &&
      request.auth.uid == request.resource.data.authorId &&
      (!('moderationStatus' in request.resource.data) || 
       request.resource.data.moderationStatus == 'pending');
    allow update, delete: if isSignedIn() && 
      (request.auth.uid == resource.data.authorId || isAdmin());
  }
}
```

#### Important Notes:
1. **Category `allowPublicRead` controls visibility** - When admin toggles this, it affects all tools in that category
2. **Server-side validation** - When creating a tool, server should set `isPublic` based on category's `allowPublicRead`
3. **Future enhancement** - Could allow per-tool `isPublic` override, but for now it inherits from category

### 7. Service Layer

Create `src/services/supportToolService.ts`:
```typescript
import { collection, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { stripUndefined } from '../utils/safeWrapper';

export interface CreateSupportToolData {
  title: string;
  content: string;
  categoryId: string;
  tags?: string[];
  imageUrl?: string;
  targetAudience?: string;
  difficulty?: string;
  prepTime?: string;
  servings?: number;
}

export async function createSupportTool(
  data: CreateSupportToolData,
  authorId: string,
  authorName: string,
  authorPhoto?: string
): Promise<string> {
  // Get category to inherit allowPublicRead
  const categoryRef = doc(db, 'supportToolCategories', data.categoryId);
  const categorySnap = await getDoc(categoryRef);
  
  if (!categorySnap.exists()) {
    throw new Error('Category not found');
  }
  
  const category = categorySnap.data();
  
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

export async function getSupportToolsByCategory(
  categoryId: string,
  includePublic: boolean = true
) {
  // Query logic - filter by category and public access
  // Implementation depends on your query needs
}

export async function getAllCategories(includeInactive: boolean = false) {
  // Get categories ordered by order field
  // Filter by isActive if needed
}
```

### 8. SEO Implementation

#### Category-Specific SEO Metadata

Create `src/components/supportTools/CategorySeo.tsx`:
```typescript
import { Helmet } from 'react-helmet-async';
import { SupportToolCategory } from '../../types';

interface CategorySeoProps {
  category: SupportToolCategory | null;
  baseUrl?: string;
}

export const CategorySeo: React.FC<CategorySeoProps> = ({ 
  category, 
  baseUrl = 'https://momsfitnessmojo.web.app' 
}) => {
  if (!category) {
    // Default SEO for /support-tools (all categories)
    return (
      <Helmet>
        <title>Support Tools | Moms Fitness Mojo - Healthy Recipes, Exercises & Tips</title>
        <meta name="description" content="Discover healthy recipes, exercises, and wellness tips from our community of moms. Share your favorite recipes, workout routines, and health advice." />
        <link rel="canonical" href={`${baseUrl}/support-tools`} />
        
        {/* Open Graph */}
        <meta property="og:title" content="Support Tools | Moms Fitness Mojo" />
        <meta property="og:description" content="Discover healthy recipes, exercises, and wellness tips from our community of moms." />
        <meta property="og:url" content={`${baseUrl}/support-tools`} />
        <meta property="og:type" content="website" />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Support Tools | Moms Fitness Mojo" />
        <meta name="twitter:description" content="Discover healthy recipes, exercises, and wellness tips from our community of moms." />
        
        {/* Structured Data - CollectionPage */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "name": "Support Tools",
            "description": "Healthy recipes, exercises, and wellness tips from Moms Fitness Mojo community",
            "url": `${baseUrl}/support-tools`,
            "mainEntity": {
              "@type": "ItemList",
              "itemListElement": []
            }
          })}
        </script>
      </Helmet>
    );
  }

  // Category-specific SEO
  const title = category.seoTitle || `${category.name} | Moms Fitness Mojo`;
  const description = category.seoDescription || category.description || 
    `Browse ${category.name.toLowerCase()} shared by our community of moms. Find healthy recipes, exercises, and wellness tips.`;
  const url = `${baseUrl}/support-tools/${category.slug}`;
  const keywords = category.seoKeywords?.join(', ') || 
    `${category.name}, mom fitness, healthy recipes, wellness tips, mom community`;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <link rel="canonical" href={url} />
      
      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      {category.seoImage && <meta property="og:image" content={category.seoImage} />}
      
      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {category.seoImage && <meta name="twitter:image" content={category.seoImage} />}
      
      {/* Structured Data - CollectionPage for Category */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "name": category.name,
          "description": description,
          "url": url,
          "breadcrumb": {
            "@type": "BreadcrumbList",
            "itemListElement": [
              {
                "@type": "ListItem",
                "position": 1,
                "name": "Home",
                "item": baseUrl
              },
              {
                "@type": "ListItem",
                "position": 2,
                "name": "Support Tools",
                "item": `${baseUrl}/support-tools`
              },
              {
                "@type": "ListItem",
                "position": 3,
                "name": category.name,
                "item": url
              }
            ]
          }
        })}
      </script>
    </Helmet>
  );
};
```

#### Usage in SupportTools.tsx
```typescript
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { CategorySeo } from '../components/supportTools/CategorySeo';
import { useFirestore } from '../hooks/useFirestore';
import { where, orderBy } from 'firebase/firestore';

const SupportTools: React.FC = () => {
  const { categorySlug } = useParams<{ categorySlug?: string }>();
  const { currentUser } = useAuth();
  const { useRealtimeCollection } = useFirestore();
  
  // Load categories
  const { data: categories } = useRealtimeCollection(
    'supportToolCategories',
    [where('isActive', '==', true), orderBy('order', 'asc')]
  );
  
  const selectedCategory = categories?.find(c => c.slug === categorySlug) || null;
  
  // Build query constraints based on permissions
  const buildQueryConstraints = () => {
    const constraints: any[] = [
      where('moderationStatus', '==', 'approved'),
      where('isDeleted', '==', false),
      orderBy('createdAt', 'desc')
    ];
    
    // Filter by category if selected
    if (selectedCategory) {
      constraints.unshift(where('categoryId', '==', selectedCategory.id));
    }
    
    // Note: Public access filtering is handled by Firestore rules
    // If user is not approved and category is members-only, rules will block access
    // If user is external and category allows public, rules will allow access
    
    return constraints;
  };
  
  // Load support tools
  const { data: supportTools } = useRealtimeCollection(
    'supportTools',
    buildQueryConstraints()
  );
  
  // Filter categories user can access
  const accessibleCategories = categories?.filter(cat => {
    // If user is approved member, can see all active categories
    if (currentUser && isUserApproved(currentUser)) {
      return cat.isActive;
    }
    // If external/pending user, only show public categories
    return cat.isActive && cat.allowPublicRead;
  }) || [];
  
  return (
    <>
      <CategorySeo category={selectedCategory} />
      
      {/* Show message if category is members-only and user can't access */}
      {selectedCategory && 
       !selectedCategory.allowPublicRead && 
       (!currentUser || !isUserApproved(currentUser)) && (
        <div className="alert alert-info">
          This category is only available to approved members. 
          Please sign in or wait for account approval.
        </div>
      )}
      
      {/* Rest of component */}
    </>
  );
};
```

### 9. Indexes Required

Add to `firestore.indexes.json`:
```json
{
  "collectionGroup": "supportTools",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "categoryId", "order": "ASCENDING" },
    { "fieldPath": "moderationStatus", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "supportToolCategories",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "isActive", "order": "ASCENDING" },
    { "fieldPath": "order", "order": "ASCENDING" }
  ]
}
```

## Implementation Phases

### Phase 1: Foundation
1. Create `supportToolCategories` collection structure
2. Create admin UI to manage categories
3. Add basic categories: "Healthy Recipes", "Healthy Exercises", "Health Tips"

### Phase 2: Core Feature
1. Create `SupportTools.tsx` page
2. Create `SupportToolCard.tsx` component
3. Create `CreateSupportToolModal.tsx` with category selector
4. Add Firestore rules
5. Add to navigation

### Phase 3: Filtering & Search
1. Implement category filter tabs
2. Add search functionality
3. Add tag filtering
4. Add difficulty/target audience filters

### Phase 4: Enhancement
1. Category-specific form fields
2. Rich text editor for content
3. Image uploads
4. Likes/comments (reuse Post pattern)
5. Views tracking

## Example User Flow

1. **User wants to post a recipe:**
   - Navigates to "Support Tools"
   - Clicks "Create" button
   - Modal opens, selects "Healthy Recipes" category
   - Form shows: Title, Content, Prep Time, Servings, Ingredients, Tags, Image
   - Fills in: "Avocado Toast for 5-Year-Olds"
   - Tags: ["5-year-old", "avocado", "breakfast", "quick"]
   - Submits → Goes to moderation → Published

2. **User wants to find recipes:**
   - Navigates to "Support Tools"
   - Clicks "Healthy Recipes" tab
   - Sees all recipes, can search "avocado" or filter by tags
   - Clicks on recipe card → Views full content

## Benefits of This Architecture

1. **Scalable**: Easy to add new categories without code changes
2. **Maintainable**: Single page, consistent patterns with Posts/Media
3. **User-Friendly**: One place to discover all support content
4. **Flexible**: Categories can have different fields/requirements
5. **Searchable**: Can search across all categories or filter to one
6. **Consistent**: Follows existing patterns (moderation, soft delete, etc.)

## SEO Benefits

### Separate URLs for Each Category
✅ **Better SEO**: Each category gets its own URL, title, description, and structured data
✅ **Indexable**: Search engines can index each category page separately
✅ **Shareable**: Users can share direct links to specific categories
✅ **Bookmarkable**: Users can bookmark favorite categories
✅ **Analytics**: Track which categories get the most traffic
✅ **Rich Snippets**: Structured data helps search engines show rich results

### Example SEO URLs
- `/support-tools` - Main page: "Support Tools | Moms Fitness Mojo"
- `/support-tools/healthy-recipes` - Category: "Healthy Recipes | Moms Fitness Mojo"
- `/support-tools/healthy-exercises` - Category: "Healthy Exercises | Moms Fitness Mojo"
- `/support-tools/health-tips` - Category: "Health Tips | Moms Fitness Mojo"

### Sitemap Integration
Add category URLs to `public/sitemap.xml`:
```xml
<url>
  <loc>https://momsfitnessmojo.web.app/support-tools</loc>
  <changefreq>daily</changefreq>
  <priority>0.8</priority>
</url>
<url>
  <loc>https://momsfitnessmojo.web.app/support-tools/healthy-recipes</loc>
  <changefreq>daily</changefreq>
  <priority>0.7</priority>
</url>
<!-- Add other categories -->
```

### Dynamic Sitemap Generation
For dynamic categories, consider generating sitemap programmatically or using Firebase Functions to update it when categories are added/updated.

## Recommendation

**✅ SEO-Optimized Single Component with Dynamic Routes** - This approach gives you:
- Single maintainable component (no code duplication)
- SEO-friendly URLs for each category (`/support-tools/:categorySlug`)
- Category-specific metadata and structured data
- Better search engine indexing
- Shareable/bookmarkable category URLs
- Scalable (new categories automatically get SEO URLs)

This is the best of both worlds: maintainable code + excellent SEO!

