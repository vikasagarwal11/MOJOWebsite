export interface ResourceCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  order: number;
  isActive: boolean;
  allowPublicRead: boolean;
  icon?: string;
  color?: string;
  parentId?: string | null;
  parentSlug?: string | null;
  parentName?: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface ResourceEntry {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  subcategoryId?: string | null;
  subcategoryName?: string | null;
  subcategorySlug?: string | null;
  location?: string;
  contact?: string;
  website?: string;
  contributorId: string;
  contributorName: string;
  contributorPhoto?: string;
  tags?: string[];
  schedule?: {
    days?: string[];
    time?: string;
    instructor?: string;
    notes?: string;
  };
  moderationStatus?: 'pending' | 'approved' | 'rejected';
  moderationReason?: string | null;
  moderatedAt?: Date;
  moderatedBy?: string;
  isPublic: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateResourceEntryData {
  title: string;
  description: string;
  categoryId: string;
  subcategoryId?: string | null;
  location?: string;
  contact?: string;
  website?: string;
  tags?: string[];
  schedule?: {
    days?: string[];
    time?: string;
    instructor?: string;
    notes?: string;
  };
  moderationStatus?: 'pending' | 'approved' | 'rejected';
  moderationReason?: string | null;
  moderatedAt?: Date;
  moderatedBy?: string;
}
