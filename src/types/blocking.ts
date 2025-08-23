export interface UserBlock {
  id: string;
  blockedUserId: string;
  blockedByUserId: string;
  reason: BlockReason;
  category: BlockCategory;
  description?: string;
  adminNotes?: string;
  isActive: boolean;
  createdAt: any; // Firestore timestamp
  updatedAt: any; // Firestore timestamp
  expiresAt?: any; // Firestore timestamp for temporary blocks
  reviewedBy?: string; // Admin who reviewed the block
  reviewedAt?: any; // Firestore timestamp
  appealStatus?: AppealStatus;
  appealReason?: string;
  appealSubmittedAt?: any; // Firestore timestamp
}

export interface BlockedUser {
  id: string;
  displayName: string;
  email: string;
  photoURL?: string;
  blockedAt: any; // Firestore timestamp
  blockReason: BlockReason;
  blockCategory: BlockCategory;
  isActive: boolean;
  expiresAt?: any; // Firestore timestamp
  canAppeal: boolean;
  appealStatus?: AppealStatus;
}

export interface BlockSummary {
  totalBlocks: number;
  activeBlocks: number;
  pendingAppeals: number;
  blocksByCategory: { [category in BlockCategory]: number };
  blocksByReason: { [reason in BlockReason]: number };
}

export type BlockReason = 
  | 'harassment'
  | 'spam'
  | 'inappropriate_content'
  | 'fake_account'
  | 'security_violation'
  | 'terms_violation'
  | 'other';

export type BlockCategory = 
  | 'platform_wide'      // Blocks all interactions
  | 'content_only'        // Blocks content creation
  | 'interaction_only'    // Blocks likes/comments
  | 'rsvp_only'          // Blocks RSVP functionality
  | 'temporary'           // Time-limited block
  | 'permanent';          // Permanent block

export type AppealStatus = 
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'under_review';

export interface BlockInteraction {
  type: 'like' | 'comment' | 'rsvp' | 'media_upload' | 'post_creation';
  targetId: string; // ID of the target (media, post, event, etc.)
  targetType: 'media' | 'post' | 'event' | 'user';
  timestamp: any; // Firestore timestamp
  blocked: boolean;
  reason?: string;
}

export interface BlockReport {
  id: string;
  reporterUserId: string;
  reportedUserId: string;
  reason: BlockReason;
  description: string;
  evidence?: string[]; // URLs or references to evidence
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  adminNotes?: string;
  createdAt: any; // Firestore timestamp
  reviewedAt?: any; // Firestore timestamp
  reviewedBy?: string; // Admin who reviewed
}

// Utility functions for blocking logic
export const isUserBlocked = (
  currentUserId: string,
  targetUserId: string,
  blocks: UserBlock[]
): boolean => {
  return blocks.some(block => 
    block.blockedUserId === targetUserId && 
    block.blockedByUserId === currentUserId && 
    block.isActive
  );
};

export const isUserBlockedBy = (
  currentUserId: string,
  targetUserId: string,
  blocks: UserBlock[]
): boolean => {
  return blocks.some(block => 
    block.blockedUserId === currentUserId && 
    block.blockedByUserId === targetUserId && 
    block.isActive
  );
};

export const getBlockLevel = (
  currentUserId: string,
  targetUserId: string,
  blocks: UserBlock[]
): BlockCategory | null => {
  const block = blocks.find(b => 
    b.blockedUserId === targetUserId && 
    b.blockedByUserId === currentUserId && 
    b.isActive
  );
  return block?.category || null;
};

export const canInteract = (
  currentUserId: string,
  targetUserId: string,
  blocks: UserBlock[],
  interactionType: 'like' | 'comment' | 'rsvp' | 'content' | 'view'
): boolean => {
  if (currentUserId === targetUserId) return true;
  
  const block = blocks.find(b => 
    b.blockedUserId === targetUserId && 
    b.blockedByUserId === currentUserId && 
    b.isActive
  );
  
  if (!block) return true;
  
  switch (block.category) {
    case 'platform_wide':
      return false;
    case 'content_only':
      return !['content', 'media_upload', 'post_creation'].includes(interactionType);
    case 'interaction_only':
      return !['like', 'comment'].includes(interactionType);
    case 'rsvp_only':
      return interactionType !== 'rsvp';
    case 'temporary':
      if (block.expiresAt && block.expiresAt.toDate() < new Date()) {
        return true; // Block expired
      }
      return false;
    case 'permanent':
      return false;
    default:
      return true;
  }
};
